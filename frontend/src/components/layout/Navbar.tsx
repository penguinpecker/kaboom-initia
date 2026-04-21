"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";

import { useAccount } from "wagmi";
import { useInterwovenKit } from "@initia/interwovenkit-react";

import { useModal } from "@/hooks/useModal";
import { useGame } from "@/hooks/useGame";
import {
  useVaultBalance, useVaultHealth, useRiskLevel, useWalletBalance,
} from "@/hooks/useContracts";
import { formatEther } from "@/lib/compat";
import { MobileDrawer } from "./MobileDrawer";
import { KaboomLogo } from "@/components/ui/KaboomLogo";

const NAV_LINKS = [
  { href: "/",            label: "Home" },
  { href: "/play",        label: "Play" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/logs",        label: "Logs" },
  { href: "/vault",       label: "Vault" },
];

export function Navbar() {
  const pathname = usePathname();
  const kit = useInterwovenKit();
  const { address, isConnected } = useAccount();
  const { open } = useModal();
  const { state, enableAutoSign, disableAutoSign } = useGame();

  const [showMobile, setShowMobile] = useState(false);
  const [showNotif, setShowNotif]   = useState(false);
  const [mounted, setMounted]       = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: vaultBal }    = useVaultBalance();
  const { data: vaultHealth } = useVaultHealth();
  const { data: riskLevel }   = useRiskLevel();
  const { data: walletBal }   = useWalletBalance();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const shortAddr   = address ? `${address.slice(0, 4)}…${address.slice(-3)}` : "";
  const isConn      = mounted && isConnected && !!address;
  const balDisplay  = walletBal ? Number(walletBal.formatted).toFixed(2) : "0.00";

  const handleConnect = () => {
    if (isConn) { open("profile"); return; }
    try { (kit as any)?.onboard?.(); } catch {}
  };

  return (
    <>
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-surface-container-low/90 backdrop-blur-xl shadow-[0_0_20px_rgba(208,188,255,0.1)]">
        <div className="flex items-center gap-8">
          <button className="lg:hidden" onClick={() => setShowMobile(true)}>
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 24 }}>menu</span>
          </button>

          <Link href="/" className="flex items-center gap-2">
            <KaboomLogo size={36} />
            <span className="text-2xl font-black italic tracking-tighter font-headline text-transparent bg-clip-text bg-gradient-to-br from-blue-300 to-blue-500">
              KABOOM!
            </span>
          </Link>

          <nav className="hidden lg:flex gap-6 items-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`font-headline tracking-tight text-sm uppercase transition-colors ${
                  pathname === link.href
                    ? "text-primary border-b-2 border-primary pb-1"
                    : "text-on-surface-variant hover:text-primary"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isConn && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-surface-container-highest rounded-lg border border-outline-variant/20">
              <span className={`w-2 h-2 rounded-full ${state.autoSignEnabled ? "bg-tertiary animate-pulse" : "bg-emerald"}`} />
              <span className="font-headline text-sm font-bold text-primary tracking-wide">
                {balDisplay} INIT
              </span>
            </div>
          )}

          {/* Auto-sign session toggle — the Initia-native feature */}
          {isConn && (
            <button
              onClick={state.autoSignEnabled ? disableAutoSign : enableAutoSign}
              className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-headline font-bold tracking-widest uppercase transition-all ${
                state.autoSignEnabled
                  ? "bg-tertiary/10 text-tertiary border-tertiary/30"
                  : "text-on-surface-variant border-outline-variant/20 hover:border-primary hover:text-primary"
              }`}
              title="InterwovenKit session signing — tile clicks become instant"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {state.autoSignEnabled ? "flash_on" : "flash_off"}
              </span>
              {state.autoSignEnabled ? "Session Active" : "Enable Session"}
            </button>
          )}

          <button
            onClick={handleConnect}
            className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-5 py-2 font-headline text-xs font-bold uppercase tracking-widest hover:shadow-[0_0_15px_rgba(164,201,255,0.4)] transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              {isConn ? "person" : "account_balance_wallet"}
            </span>
            <span className="hidden sm:inline">{isConn ? shortAddr : "Connect"}</span>
          </button>

          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative p-2 hover:bg-surface-container-highest rounded-lg transition-all"
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 22 }}>
                notifications
              </span>
            </button>
            {showNotif && (
              <div className="absolute right-0 top-12 w-80 bg-surface-container-low border border-outline-variant/15 shadow-[0_8px_32px_rgba(0,0,0,.6)] z-50">
                <div className="px-4 py-3 border-b border-outline-variant/10 flex justify-between">
                  <span className="font-headline text-xs font-bold tracking-widest uppercase text-primary">
                    System Status
                  </span>
                </div>
                <div className="max-h-[260px] overflow-y-auto">
                  <NR icon="shield"           color="text-emerald"   label="VAULT"    msg={`Health: ${vaultHealth?.toString() ?? "—"}%`} />
                  <NR icon="account_balance"  color="text-primary"   label="BALANCE"  msg={`${vaultBal ? Number(formatEther(vaultBal as bigint)).toFixed(2) : "—"} INIT`} />
                  <NR icon="verified"         color="text-secondary" label="FAIRNESS" msg="Commit-Reveal (keccak256)" />
                  <NR icon="speed"            color="text-tertiary"  label="CHAIN"    msg="Initia MiniEVM" />
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => open("settings")}
            className="hidden lg:block p-2 hover:bg-surface-container-highest rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 22 }}>settings</span>
          </button>
        </div>
      </header>
      {showMobile && <MobileDrawer onClose={() => setShowMobile(false)} />}
    </>
  );
}

function NR({ icon, color, label, msg }: { icon: string; color: string; label: string; msg: string }) {
  return (
    <div className="px-4 py-3 border-b border-outline-variant/[0.05]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined mi ${color}`} style={{ fontSize: 16 }}>{icon}</span>
        <span className={`font-headline text-[10px] ${color} tracking-widest`}>{label}</span>
      </div>
      <p className="text-xs text-on-surface-variant">{msg}</p>
    </div>
  );
}
