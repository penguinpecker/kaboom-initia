"use client";
import { useEffect, useRef } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";

import { INITIA_EVM_CHAIN_ID } from "@/lib/chain";

/**
 * On wallet connect, if MetaMask (or any injected wallet) is on the wrong
 * chain, ask it to switch. wagmi's switchChainAsync calls
 * wallet_switchEthereumChain → if the chain is unknown the wallet falls back
 * to wallet_addEthereumChain, surfacing the "Add Network" prompt with our
 * RPC URL pre-filled.
 */
export default function ChainGuard() {
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const askedRef = useRef(false);

  useEffect(() => {
    if (!isConnected) { askedRef.current = false; return; }
    if (currentChainId === INITIA_EVM_CHAIN_ID) return;
    if (askedRef.current) return;
    askedRef.current = true;
    switchChainAsync({ chainId: INITIA_EVM_CHAIN_ID }).catch((e) => {
      console.warn("ChainGuard: switch failed", e?.shortMessage || e?.message || e);
      // allow retry on next state change
      askedRef.current = false;
    });
  }, [isConnected, currentChainId, switchChainAsync]);

  return null;
}
