"use client";
import {
  createContext, useContext, useState, useCallback, useEffect, ReactNode,
  useMemo, useRef,
} from "react";
import { useAccount, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useInterwovenKit } from "@initia/interwovenkit-react";
import { parseEther, formatEther } from "viem";

import { KABOOM_ABI, KABOOM_ADDRESS, GAME_CONFIG, INITIA_EVM_CHAIN_ID } from "@/lib/chain";
import { ensureInitiaChain } from "@/lib/switchChain";

type GameStatus =
  | "idle" | "starting" | "playing" | "revealing"
  | "cashing" | "won" | "lost" | "cleaning";

export interface GameResult {
  gameId: string;  player: string;  won: boolean;  bet: number;
  payout: number;  multiplier: number;  mineCount: number;
  tilesCleared: number;  txHash: string;  timestamp: number;
}

interface GameState {
  gameId: bigint | null;
  status: GameStatus;
  bet: number;
  mineCount: number;
  revealedTiles: Set<number>;
  safeTiles: Set<number>;
  mineTiles: Set<number>;
  multiplier: number;
  commitment: string;
  payout: number;
  pendingTile: number | null;
  sessionPnl: number;
  sessionGames: number;
  error: string | null;
  lastTxHash: string | null;
  autoSignEnabled: boolean;
}

interface GameContextType {
  state: GameState;
  setBet: (bet: number) => void;
  setMineCount: (count: number) => void;
  startGame: () => void;
  revealTile: (index: number) => void;
  cashOut: () => void;
  resetGame: () => void;
  enableAutoSign: () => Promise<void>;
  disableAutoSign: () => Promise<void>;
  gameHistory: GameResult[];
  walletAddress: string | null;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
}

const initialState: GameState = {
  gameId: null, status: "idle", bet: 0.01, mineCount: 3,
  revealedTiles: new Set(), safeTiles: new Set(), mineTiles: new Set(),
  multiplier: 1.0, commitment: "", payout: 0,
  pendingTile: null, sessionPnl: 0, sessionGames: 0,
  error: null, lastTxHash: null, autoSignEnabled: false,
};

const GameContext = createContext<GameContextType | null>(null);

// ─── local persistence ────────────────────────────────────────────────────
const HISTORY_KEY = "kaboom_game_history";
const TOKEN_KEY   = "kaboom_game_token";

function loadHistory(): GameResult[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}
function saveResult(r: GameResult) {
  if (typeof window === "undefined") return;
  const h = loadHistory(); h.unshift(r);
  if (h.length > 100) h.length = 100;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
}
function saveToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
function loadToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

// ─── multiplier math (mirror contract) ────────────────────────────────────
function calcMultiplier(safeReveals: number, mineCount: number): number {
  let m = 1;
  for (let i = 0; i < safeReveals; i++) {
    const remaining    = GAME_CONFIG.GRID_SIZE - i;
    const safeRemaining = GAME_CONFIG.GRID_SIZE - mineCount - i;
    if (safeRemaining > 0) m *= remaining / safeRemaining;
  }
  return m * (1 - GAME_CONFIG.HOUSE_EDGE);
}

// ─── server calls ─────────────────────────────────────────────────────────
async function api(path: string, body: object): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Server error " + res.status);
  return data;
}

// ─── provider ─────────────────────────────────────────────────────────────
export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(initialState);
  const [gameHistory, setGameHistory] = useState<GameResult[]>([]);
  const gameTokenRef = useRef<string | null>(null);

  // ── wallet plumbing ──
  const { address, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const kit = useInterwovenKit();
  const { writeContractAsync } = useWriteContract();

  // Make sure the wallet is on kaboom-1 before we even try to sign. wagmi's
  // useSwitchChain errors if the current wallet chain (e.g. Base 8453) is
  // not in our wagmi `chains` config. Go direct to window.ethereum so it
  // works regardless of what network the user started on.
  const ensureChain = useCallback(async () => {
    if (walletChainId === INITIA_EVM_CHAIN_ID) return;
    await ensureInitiaChain();
    // Fall through: let wagmi resync; the next tick of useChainId will
    // surface the new chain id. writeContract will still pin chainId in
    // the payload for safety.
  }, [walletChainId]);

  const walletAddress = address ?? null;
  const authenticated = isConnected;

  const login  = useCallback(() => { try { kit.openConnect(); } catch {} }, [kit]);
  const logout = useCallback(() => { try { kit.disconnect(); } catch {} }, [kit]);

  // ── persistent state ──
  useEffect(() => { setGameHistory(loadHistory()); }, []);
  useEffect(() => { gameTokenRef.current = loadToken(); }, []);

  // ── setters ──
  const setBet       = useCallback((bet: number)   => setState(p => ({ ...p, bet })), []);
  const setMineCount = useCallback((count: number) => setState(p => ({ ...p, mineCount: count })), []);

  // ── auto-sign: the Initia-native feature ──
  const enableAutoSign = useCallback(async () => {
    try {
      await kit.autoSign.enable();
      setState(p => ({ ...p, autoSignEnabled: true, error: null }));
    } catch (e: any) {
      setState(p => ({ ...p, error: "Auto-sign failed: " + (e?.message || String(e)) }));
    }
  }, [kit]);

  const disableAutoSign = useCallback(async () => {
    try {
      await kit.autoSign.disable();
      setState(p => ({ ...p, autoSignEnabled: false }));
    } catch {}
  }, [kit]);

  // ── low-level EVM tx helper (untyped pass-through to preserve ergonomics) ──
  // wagmi's writeContract has very tight ABI-generic types; easier to pass
  // through `any` here than fight the 7-way tuple inference.
  async function callContract(functionName: string, args: any[], value?: bigint): Promise<`0x${string}`> {
    await ensureChain();
    return await writeContractAsync({
      address: KABOOM_ADDRESS,
      abi: KABOOM_ABI,
      functionName,
      args,
      value,
      chainId: INITIA_EVM_CHAIN_ID,
    } as any) as `0x${string}`;
  }

  // ── START GAME ───────────────────────────────────────────────────────────
  const startGame = useCallback(async () => {
    if (!authenticated) { login(); return; }
    if (!address) { setState(p => ({ ...p, error: "Wallet not ready" })); return; }
    setState(p => ({ ...p, status: "starting", error: null }));

    try {
      const betWei = parseEther(String(state.bet));
      const commitData = await api("/api/commit", {
        player: address,
        mineCount: state.mineCount,
        betWei: betWei.toString(),
      });

      gameTokenRef.current = commitData.gameToken;
      saveToken(commitData.gameToken);

      const commitment = commitData.commitment as `0x${string}`;
      const sig = await callContract("startGame", [state.mineCount, commitment], betWei);

      setState(p => ({
        ...p,
        gameId: BigInt(Date.now()),
        status: "playing",
        commitment: commitData.commitment,
        lastTxHash: sig,
        error: null,
        revealedTiles: new Set(),
        safeTiles: new Set(),
        mineTiles: new Set(),
        multiplier: 1.0,
        payout: 0,
        pendingTile: null,
      }));
    } catch (err: any) {
      console.error("Start game failed:", err);
      setState(p => ({ ...p, status: "idle", error: err?.shortMessage || err?.message || "Start failed" }));
    }
  }, [authenticated, address, state.bet, state.mineCount, login]);

  // ── REVEAL TILE ──────────────────────────────────────────────────────────
  const revealTile = useCallback(async (index: number) => {
    if (state.status !== "playing" || state.pendingTile !== null) return;
    if (state.revealedTiles.has(index)) return;
    setState(p => ({ ...p, pendingTile: index, status: "revealing" }));

    try {
      const data = await api("/api/reveal", {
        player: address, tileIndex: index, gameToken: gameTokenRef.current,
      });
      if (data.gameToken) { gameTokenRef.current = data.gameToken; saveToken(data.gameToken); }

      if (data.isMine) {
        saveToken(null); gameTokenRef.current = null;
        setState(p => {
          const nr = new Set(p.revealedTiles); nr.add(index);
          const nm = new Set(p.mineTiles); nm.add(index);
          saveResult({
            gameId: p.gameId?.toString() || "0",
            player: address || "",
            won: false, bet: p.bet, payout: 0, multiplier: 0,
            mineCount: p.mineCount, tilesCleared: p.safeTiles.size,
            txHash: data.revealTx || "", timestamp: Date.now(),
          });
          return {
            ...p, status: "lost",
            revealedTiles: nr, mineTiles: nm, pendingTile: null,
            lastTxHash: data.revealTx || null,
            sessionGames: p.sessionGames + 1,
            sessionPnl:   p.sessionPnl - p.bet,
          };
        });
        setGameHistory(loadHistory());
      } else {
        setState(p => {
          const nr = new Set(p.revealedTiles); nr.add(index);
          const ns = new Set(p.safeTiles);     ns.add(index);
          const mult = calcMultiplier(ns.size, p.mineCount);
          const totalSafe = GAME_CONFIG.GRID_SIZE - p.mineCount;
          return {
            ...p,
            status: ns.size >= totalSafe ? "won" : "playing",
            revealedTiles: nr, safeTiles: ns,
            multiplier: mult, pendingTile: null,
            lastTxHash: data.revealTx || null,
          };
        });
      }
    } catch (err: any) {
      console.error("Reveal failed:", err);
      setState(p => ({
        ...p, pendingTile: null, status: "playing",
        error: err?.message || "Reveal failed",
      }));
    }
  }, [state.status, state.pendingTile, state.revealedTiles, address]);

  // ── CASH OUT ─────────────────────────────────────────────────────────────
  const cashOut = useCallback(async () => {
    if (state.status !== "playing" || state.safeTiles.size === 0) return;
    setState(p => ({ ...p, status: "cashing" }));

    try {
      const payout = state.bet * state.multiplier;

      // 1. Player signs cashOut() — pulls winnings from the vault.
      const sig = await callContract("cashOut", []);

      // 2. Server settles (reveals mine layout + salt on-chain) so the round
      //    is publicly auditable. Fire-and-forget; doesn't block the UI.
      api("/api/settle", {
        player: address, gameToken: gameTokenRef.current, phase: "settle",
      }).catch(() => {});

      saveToken(null); gameTokenRef.current = null;

      setState(p => {
        saveResult({
          gameId: p.gameId?.toString() || "0",
          player: address || "",
          won: true, bet: p.bet, payout,
          multiplier: p.multiplier, mineCount: p.mineCount,
          tilesCleared: p.safeTiles.size, txHash: sig, timestamp: Date.now(),
        });
        return {
          ...p, status: "won",
          payout, lastTxHash: sig,
          sessionGames: p.sessionGames + 1,
          sessionPnl:   p.sessionPnl + (payout - p.bet),
        };
      });
      setGameHistory(loadHistory());
    } catch (err: any) {
      console.error("Cash out failed:", err);
      setState(p => ({ ...p, status: "playing", error: err?.shortMessage || err?.message || "Cash out failed" }));
    }
  }, [state.status, state.safeTiles, state.bet, state.multiplier, address]);

  // ── RESET ────────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    saveToken(null); gameTokenRef.current = null;
    setState(p => ({
      ...initialState,
      bet: p.bet, mineCount: p.mineCount,
      sessionPnl: p.sessionPnl, sessionGames: p.sessionGames,
      autoSignEnabled: p.autoSignEnabled,
    }));
  }, []);

  const value = useMemo<GameContextType>(() => ({
    state, setBet, setMineCount, startGame, revealTile, cashOut, resetGame,
    enableAutoSign, disableAutoSign,
    gameHistory, walletAddress, authenticated, login, logout,
  }), [state, setBet, setMineCount, startGame, revealTile, cashOut, resetGame,
      enableAutoSign, disableAutoSign, gameHistory, walletAddress, authenticated, login, logout]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
