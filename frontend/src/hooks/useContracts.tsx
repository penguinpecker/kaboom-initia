"use client";
import { useMemo } from "react";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { KABOOM_ABI, KABOOM_ADDRESS } from "@/lib/chain";

const POLL_MS = 8_000;

// ─── Vault reads ───────────────────────────────────────────────────────────

export function useVaultBalance() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "vaultBalance",
    query: { refetchInterval: POLL_MS },
  });
}

export function useVaultHealth() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "vaultHealth",
    query: { refetchInterval: POLL_MS },
  });
}

export function useVaultMaxBet() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "maxBetCurrent",
    query: { refetchInterval: POLL_MS },
  });
}

export function useVaultMaxPayout() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "maxPayoutCurrent",
    query: { refetchInterval: POLL_MS },
  });
}

export function useGameCounter() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "totalGames",
    query: { refetchInterval: POLL_MS },
  });
}

export function useRiskLevel() {
  return useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "riskLevel",
    query: { refetchInterval: POLL_MS },
  });
}

// Deprecated / Solana-only; kept so the UI compiles untouched for now.
export function useWhaleAlertCount() {
  return { data: 0 };
}

// ─── Leaderboard ───────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  player: `0x${string}`;
  biggestWin: bigint;
  biggestMultiplier: bigint;  // stored as uint64 bps; UI divides by 10_000
  totalWon: bigint;
  gamesPlayed: bigint;
}

/**
 * We read the last 50 "recent wins" from the contract and fold them into a
 * per-player leaderboard. This is accurate for all real winners (losses never
 * enter recentWins), plus it keeps the hook reactive across games.
 */
export function useLeaderboard(): { data: LeaderboardEntry[] } {
  const { data: recent } = useReadContract({
    address: KABOOM_ADDRESS,
    abi: KABOOM_ABI,
    functionName: "getRecentWins",
    args: [0n, 50n],
    query: { refetchInterval: POLL_MS * 2 },
  });

  const entries = useMemo<LeaderboardEntry[]>(() => {
    if (!recent) return [];
    const map = new Map<string, LeaderboardEntry>();
    for (const w of recent as readonly any[]) {
      const key = (w.player as string).toLowerCase();
      const e = map.get(key) ?? {
        player: w.player,
        biggestWin: 0n,
        biggestMultiplier: 0n,
        totalWon: 0n,
        gamesPlayed: 0n,
      };
      e.gamesPlayed += 1n;
      e.totalWon += w.payout as bigint;
      if ((w.payout as bigint) > e.biggestWin) e.biggestWin = w.payout as bigint;
      if ((w.multiplierBps as bigint) > e.biggestMultiplier) e.biggestMultiplier = w.multiplierBps as bigint;
      map.set(key, e);
    }
    return Array.from(map.values()).sort((a, b) => (b.totalWon > a.totalWon ? 1 : -1));
  }, [recent]);

  return { data: entries };
}

// ─── Deposit vault — player funds the house ────────────────────────────────

export function useDepositToVault() {
  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const deposit = async (amountInit: string) => {
    const v = Number(amountInit);
    if (!Number.isFinite(v) || v <= 0) return;
    try {
      await writeContractAsync({
        address: KABOOM_ADDRESS,
        abi: KABOOM_ABI,
        functionName: "fundVault",
        value: parseEther(String(v)),
      });
    } catch (e) {
      console.error("Deposit failed:", e);
    }
  };
  return { deposit, isPending, isConfirming, isSuccess };
}

// ─── Connected-wallet balance (used by Navbar / BetControls) ───────────────

export function useWalletBalance() {
  const { address } = useAccount();
  return useBalance({ address, query: { refetchInterval: POLL_MS } });
}
