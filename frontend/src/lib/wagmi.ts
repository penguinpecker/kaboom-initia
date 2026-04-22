"use client";
import { createConfig, http } from "wagmi";
import { base, mainnet, arbitrum, optimism, polygon, sepolia } from "wagmi/chains";

import { initiaChain } from "./chain";

// Register common chains too so wagmi doesn't throw ConnectorChainMismatchError
// when the user's wallet starts on Base/Ethereum/etc. All transports go
// through our rollup RPC only for kaboom-1; the others use default public RPCs.
export const wagmiConfig = createConfig({
  chains: [initiaChain, mainnet, base, arbitrum, optimism, polygon, sepolia],
  transports: {
    [initiaChain.id]: http(),
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
