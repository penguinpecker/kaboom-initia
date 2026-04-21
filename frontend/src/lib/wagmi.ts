"use client";
import { createConfig, http } from "wagmi";
import { initiaChain } from "./chain";

export const wagmiConfig = createConfig({
  chains: [initiaChain],
  transports: { [initiaChain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
