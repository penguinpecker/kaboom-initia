import { defineChain } from "viem";

// ─── Network parameters ────────────────────────────────────────────────────
// All four live mainnet MiniEVM rollups follow the same URL pattern:
//   https://jsonrpc-<chain-id>.anvil.asia-southeast.initia.xyz
// Your own "kaboom-1" Minitia (once provisioned via the Initia Anvil
// Credits program promised to hackathon winners) will receive a URL of the
// same shape. Drop it into .env.local.
export const INITIA_RPC =
  process.env.NEXT_PUBLIC_INITIA_RPC_URL ||
  "https://jsonrpc-yominet-1.anvil.asia-southeast.initia.xyz";

// Cosmos REST API (port 1317). InterwovenKit hits /cosmos/auth/...,
// /cosmos/bank/..., etc. on this URL — distinct from the EVM JSON-RPC above.
export const INITIA_REST =
  process.env.NEXT_PUBLIC_INITIA_REST_URL || INITIA_RPC;

// CometBFT RPC (port 26657). Some InterwovenKit code paths query block info.
export const INITIA_COSMOS_RPC =
  process.env.NEXT_PUBLIC_INITIA_COSMOS_RPC_URL || INITIA_REST;

export const INITIA_EVM_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_INITIA_EVM_CHAIN_ID || "428962654539583",
);

export const INITIA_COSMOS_CHAIN_ID =
  process.env.NEXT_PUBLIC_INITIA_COSMOS_CHAIN_ID || "yominet-1";

export const INITIA_CHAIN_PRETTY_NAME =
  process.env.NEXT_PUBLIC_INITIA_CHAIN_NAME || "Initia Mainnet";

export const EXPLORER =
  process.env.NEXT_PUBLIC_INITIA_EXPLORER || "https://scan.initia.xyz";

// Kaboom contract address — output of scripts/deploy.ts (writes deployments/<name>.json)
export const KABOOM_ADDRESS = (process.env.NEXT_PUBLIC_KABOOM_ADDRESS ||
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

// ─── viem chain ────────────────────────────────────────────────────────────
export const initiaChain = defineChain({
  id: INITIA_EVM_CHAIN_ID,
  name: INITIA_CHAIN_PRETTY_NAME,
  nativeCurrency: { name: "Initia", symbol: "INIT", decimals: 18 },
  rpcUrls: {
    default: { http: [INITIA_RPC] },
  },
  blockExplorers: {
    default: { name: "InitiaScan", url: EXPLORER },
  },
  testnet: false,
});

// ─── Game constants (mirror contract) ──────────────────────────────────────
export const GAME_CONFIG = {
  GRID_SIZE: 16,
  GRID_COLS: 4,
  HOUSE_EDGE: 0.02,
  MIN_MINES: 1,
  MAX_MINES: 12,
  MINE_OPTIONS: [1, 3, 5, 8, 10, 12] as const,
  MAX_BET_PERCENT: 0.02,
  MAX_PAYOUT_PERCENT: 0.10,
  MIN_BET_INIT: 0.001,
  BPS_DENOMINATOR: 10_000,
  GAME_EXPIRY_SECONDS: 300,
} as const;

export const CONTRACTS: Record<string, string> = {
  Kaboom: KABOOM_ADDRESS,
};

// ─── Kaboom ABI — hand-written subset ──────────────────────────────────────
// Keeping this in one file avoids a separate build step. Regenerate with
// `cat contracts/artifacts/Kaboom.json | jq .abi` if the contract changes.
export const KABOOM_ABI = [
  // ── state vars (public auto-getters) ──
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "houseAuthority", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "houseEdgeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "maxBetBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "maxPayoutBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "paused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalGames", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  { type: "function", name: "totalWagered", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalPayouts", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },

  // ── views ──
  { type: "function", name: "vaultBalance", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "vaultHealth", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "riskLevel", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "maxBetCurrent", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxPayoutCurrent", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "recentWinsCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function", name: "getRecentWins", stateMutability: "view",
    inputs: [{ type: "uint256", name: "offset" }, { type: "uint256", name: "limit" }],
    outputs: [{
      type: "tuple[]",
      components: [
        { type: "address", name: "player" },
        { type: "uint256", name: "bet" },
        { type: "uint256", name: "payout" },
        { type: "uint64",  name: "multiplierBps" },
        { type: "uint64",  name: "timestamp" },
      ],
    }],
  },
  {
    type: "function", name: "games", stateMutability: "view",
    inputs: [{ type: "address" }],
    // NOTE: returns a tuple of the 12 public fields of GameSession
    outputs: [
      { type: "uint8",   name: "status" },
      { type: "uint8",   name: "mineCount" },
      { type: "uint8",   name: "safeReveals" },
      { type: "uint16",  name: "revealedMask" },
      { type: "uint16",  name: "revealedSafeMask" },
      { type: "uint16",  name: "mineLayout" },
      { type: "uint64",  name: "multiplierBps" },
      { type: "uint64",  name: "startTime" },
      { type: "bool",    name: "settled" },
      { type: "uint256", name: "bet" },
      { type: "bytes32", name: "commitment" },
      { type: "bytes32", name: "salt" },
    ],
  },
  {
    type: "function", name: "stats", stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { type: "uint64",  name: "gamesPlayed" },
      { type: "uint64",  name: "gamesWon" },
      { type: "uint256", name: "biggestWin" },
      { type: "uint64",  name: "biggestMultiplierBps" },
      { type: "uint256", name: "totalWagered" },
      { type: "uint256", name: "totalWon" },
    ],
  },
  {
    type: "function", name: "verifyGame", stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { type: "bool",    name: "ok" },
      { type: "bytes32", name: "computed" },
      { type: "bytes32", name: "stored" },
    ],
  },

  // ── player txs ──
  {
    type: "function", name: "startGame", stateMutability: "payable",
    inputs: [{ type: "uint8", name: "mineCount" }, { type: "bytes32", name: "commitment" }],
    outputs: [],
  },
  { type: "function", name: "cashOut",        stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "refundExpired",  stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function", name: "closeGame", stateMutability: "nonpayable",
    inputs: [{ type: "address", name: "player" }], outputs: [],
  },
  { type: "function", name: "fundVault",       stateMutability: "payable", inputs: [], outputs: [] },

  // ── house txs ──
  {
    type: "function", name: "revealTile", stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "player" },
      { type: "uint8",   name: "tileIndex" },
      { type: "bool",    name: "isMine" },
    ],
    outputs: [],
  },
  {
    type: "function", name: "settleGame", stateMutability: "nonpayable",
    inputs: [
      { type: "address", name: "player" },
      { type: "uint16",  name: "mineLayout" },
      { type: "bytes32", name: "salt" },
    ],
    outputs: [],
  },

  // ── events ──
  {
    type: "event", name: "GameStarted",
    inputs: [
      { type: "address", name: "player", indexed: true },
      { type: "uint256", name: "bet" },
      { type: "uint8",   name: "mineCount" },
      { type: "bytes32", name: "commitment" },
      { type: "uint64",  name: "timestamp" },
    ],
  },
  {
    type: "event", name: "TileRevealed",
    inputs: [
      { type: "address", name: "player", indexed: true },
      { type: "uint8",   name: "tileIndex" },
      { type: "bool",    name: "isMine" },
      { type: "uint64",  name: "multiplierBps" },
      { type: "uint8",   name: "safeReveals" },
    ],
  },
  {
    type: "event", name: "GameWon",
    inputs: [
      { type: "address", name: "player", indexed: true },
      { type: "uint256", name: "bet" },
      { type: "uint256", name: "payout" },
      { type: "uint64",  name: "multiplierBps" },
      { type: "uint8",   name: "safeReveals" },
    ],
  },
  {
    type: "event", name: "GameLost",
    inputs: [
      { type: "address", name: "player", indexed: true },
      { type: "uint256", name: "bet" },
      { type: "uint8",   name: "tileIndex" },
      { type: "uint8",   name: "safeReveals" },
    ],
  },
  {
    type: "event", name: "GameSettled",
    inputs: [
      { type: "address", name: "player", indexed: true },
      { type: "uint16",  name: "mineLayout" },
      { type: "bytes32", name: "commitment" },
      { type: "bool",    name: "verified" },
    ],
  },
] as const;

// Map of message types allowed under InterwovenKit auto-signing. Used when we
// ask the user to "enable sessions" so tile clicks feel instant.
export const AUTOSIGN_MSG_TYPES = [
  "/cosmos.evm.vm.v1.MsgCall",
  "/cosmos.evm.vm.v1.MsgCreate",
];
