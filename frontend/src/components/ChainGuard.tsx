"use client";
import { useEffect, useRef } from "react";
import { useAccount, useChainId } from "wagmi";

import { INITIA_EVM_CHAIN_ID, INITIA_CHAIN_PRETTY_NAME } from "@/lib/chain";
import { ensureInitiaChain } from "@/lib/switchChain";

/**
 * Auto-switches the wallet to kaboom-1 on connect, AND shows a visible
 * banner if we're on the wrong chain and the auto-switch fails (e.g. the
 * user rejected it).
 */
export default function ChainGuard() {
  const { isConnected } = useAccount();
  const currentChainId = useChainId();
  const lastAskedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isConnected) { lastAskedRef.current = null; return; }
    if (currentChainId === INITIA_EVM_CHAIN_ID) return;
    if (lastAskedRef.current === currentChainId) return;
    lastAskedRef.current = currentChainId;
    ensureInitiaChain().catch((e) => {
      console.warn("ChainGuard: switch rejected", e?.message || e);
    });
  }, [isConnected, currentChainId]);

  if (!isConnected || currentChainId === INITIA_EVM_CHAIN_ID) return null;

  const onSwitch = () => {
    lastAskedRef.current = null;
    ensureInitiaChain().catch(() => {});
  };

  return (
    <div
      role="alert"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-error text-on-error shadow-lg flex items-center gap-3 font-headline text-sm"
    >
      <span className="material-symbols-outlined mi" style={{ fontSize: 18 }}>
        warning
      </span>
      <span>Wrong network — switch to <b>{INITIA_CHAIN_PRETTY_NAME}</b></span>
      <button
        type="button"
        onClick={onSwitch}
        className="ml-2 px-3 py-1 rounded-full bg-on-error text-error text-xs font-bold hover:opacity-90"
      >
        Switch
      </button>
    </div>
  );
}
