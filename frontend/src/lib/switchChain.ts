"use client";
import {
  INITIA_EVM_CHAIN_ID,
  INITIA_CHAIN_PRETTY_NAME,
  INITIA_RPC,
  EXPLORER,
} from "./chain";

// EVM chain id in hex for MetaMask's eth_* methods.
const chainIdHex = "0x" + INITIA_EVM_CHAIN_ID.toString(16);

const params = {
  chainId: chainIdHex,
  chainName: INITIA_CHAIN_PRETTY_NAME,
  nativeCurrency: { name: "Initia", symbol: "INIT", decimals: 18 },
  rpcUrls: [INITIA_RPC],
  blockExplorerUrls: EXPLORER ? [EXPLORER] : [],
};

type Eth = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function getProvider(): Eth | null {
  if (typeof window === "undefined") return null;
  // Prefer the specific MetaMask provider if multiple wallets are injected.
  const w = window as unknown as {
    ethereum?: Eth & { providers?: Array<Eth & { isMetaMask?: boolean }> };
  };
  const eth = w.ethereum;
  if (!eth) return null;
  if (eth.providers && eth.providers.length) {
    const mm = eth.providers.find((p) => p.isMetaMask);
    return mm ?? eth.providers[0] ?? eth;
  }
  return eth;
}

/**
 * Force the injected wallet onto kaboom-1. Tries wallet_switchEthereumChain
 * first (instant if known); if the wallet doesn't know the chain (error
 * code 4902), falls through to wallet_addEthereumChain which prompts the
 * user to approve adding it with our RPC URL. Bypasses wagmi so it doesn't
 * get confused by chains missing from its `chains` config.
 */
export async function ensureInitiaChain(): Promise<void> {
  const eth = getProvider();
  if (!eth) throw new Error("No injected wallet found");

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
    return;
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string } | undefined;
    // 4902 = Unrecognized chain. Any EIP-1193 error that looks like "not
    // recognised" / "missing chain" triggers the add-chain flow.
    const code = e?.code;
    const msg = (e?.message || "").toLowerCase();
    const unknown =
      code === 4902 ||
      code === -32603 ||
      msg.includes("unrecognized") ||
      msg.includes("has not been added") ||
      msg.includes("not been added to metamask");
    if (!unknown) throw err;
  }

  await eth.request({
    method: "wallet_addEthereumChain",
    params: [params],
  });
}
