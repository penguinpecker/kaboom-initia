"use client";
import { useModal } from "@/hooks/useModal";
import { EXPLORER } from "@/lib/chain";

export function Footer() {
  const { open } = useModal();
  return (
    <footer className="flex justify-between items-center px-4 md:px-6 py-2.5 bg-surface-container-low border-t border-outline-variant/[0.06]">
      <div className="font-headline text-[7px] tracking-[.08em] uppercase text-on-surface-variant/25">
        © 2026 KABOOM! • Initia MiniEVM
      </div>
      <div className="flex gap-4">
        <button onClick={() => open("fair")} className="font-headline text-[7px] tracking-widest uppercase text-on-surface-variant/20 hover:text-primary transition-colors">
          Provably Fair
        </button>
        <a href="https://github.com/penguinpecker/kaboom-initia" target="_blank" rel="noreferrer"
           className="font-headline text-[7px] tracking-widest uppercase text-on-surface-variant/20 hover:text-primary transition-colors">
          GitHub
        </a>
        <a href={EXPLORER} target="_blank" rel="noreferrer"
           className="font-headline text-[7px] tracking-widest uppercase text-on-surface-variant/20 hover:text-primary transition-colors">
          InitiaScan
        </a>
      </div>
    </footer>
  );
}
