import { createWalletClient, createPublicClient, http, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

// ─── Server-side environment ───────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const HOUSE_AUTHORITY_KEY = () => requireEnv("HOUSE_AUTHORITY_KEY") as Hex;
export const KABOOM_ADDRESS      = () => requireEnv("NEXT_PUBLIC_KABOOM_ADDRESS") as Hex;

export const RPC_URL = () =>
  process.env.INITIA_RPC_URL ||
  process.env.NEXT_PUBLIC_INITIA_RPC_URL ||
  "https://jsonrpc-yominet-1.anvil.asia-southeast.initia.xyz";

export const EVM_CHAIN_ID = () =>
  Number(process.env.INITIA_EVM_CHAIN_ID ||
         process.env.NEXT_PUBLIC_INITIA_EVM_CHAIN_ID ||
         "428962654539583");

// ─── viem clients (server-side singletons) ────────────────────────────────

function serverChain() {
  const id = EVM_CHAIN_ID();
  const rpc = RPC_URL();
  return defineChain({
    id,
    name: "Initia MiniEVM",
    nativeCurrency: { name: "Initia", symbol: "INIT", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
}

let _public: any = null;
let _wallet: any = null;
let _account: any = null;

export function getPublicClient() {
  if (_public) return _public;
  _public = createPublicClient({ chain: serverChain(), transport: http(RPC_URL()) });
  return _public;
}

export function getHouseAccount() {
  if (_account) return _account;
  _account = privateKeyToAccount(HOUSE_AUTHORITY_KEY());
  return _account;
}

export function getHouseClient() {
  if (_wallet) return _wallet;
  _wallet = createWalletClient({
    account: getHouseAccount(),
    chain: serverChain(),
    transport: http(RPC_URL()),
  });
  return _wallet;
}
