"use client";
import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InterwovenKitProvider } from "@initia/interwovenkit-react";
import "@initia/interwovenkit-react/styles.css";

import { wagmiConfig } from "@/lib/wagmi";
import { INITIA_COSMOS_CHAIN_ID, initiaChain } from "@/lib/chain";

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 1000 * 10, refetchOnWindowFocus: false },
    },
  }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InterwovenKitProvider
          defaultChainId={INITIA_COSMOS_CHAIN_ID}
          customChain={initiaChain}
        >
          {children}
        </InterwovenKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
