import type { Metadata } from "next";
import "./globals.css";
// InterwovenKit's modal CSS must be imported from the root (Server Component)
// layout — Next.js App Router drops CSS imports from `"use client"` files in
// prod, which made the connect modal render as raw unstyled DOM.
import "@initia/interwovenkit-react/styles.css";
import Web3Provider from "@/providers/Web3Provider";
import { GameProvider } from "@/hooks/useGame";
import { ModalProvider } from "@/hooks/useModal";
import { ToastProvider } from "@/hooks/useToast";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ModalRoot } from "@/components/modals/ModalRoot";

export const metadata: Metadata = {
  title: "KABOOM! — On-Chain Mines on Initia",
  description: "Provably fair 4×4 Mines on Initia MiniEVM. Commit-reveal fairness. Session-signed tile clicks via InterwovenKit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head />
      <body className="bg-surface text-on-surface font-body min-h-screen flex flex-col">
        <Web3Provider>
          <ModalProvider>
            <ToastProvider>
              <GameProvider>
                <Navbar />
                <main className="flex-1 pt-16">{children}</main>
                <Footer />
                <ModalRoot />
              </GameProvider>
            </ToastProvider>
          </ModalProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
