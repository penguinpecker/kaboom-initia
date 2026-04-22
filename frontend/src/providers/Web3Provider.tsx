"use client";
import { ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InterwovenKitProvider } from "@initia/interwovenkit-react";
import "@initia/interwovenkit-react/styles.css";

import { wagmiConfig } from "@/lib/wagmi";
import ChainGuard from "@/components/ChainGuard";
import {
  INITIA_COSMOS_CHAIN_ID,
  INITIA_RPC,
  INITIA_REST,
  INITIA_COSMOS_RPC,
  INITIA_EVM_CHAIN_ID,
  INITIA_CHAIN_PRETTY_NAME,
} from "@/lib/chain";

// InterwovenKitProvider.customChain wants a Cosmos-registry-shaped Chain
// (chain_id/apis/fees/…), not a viem Chain. The destructure
// `{rpc, rest, "json-rpc", indexer} = apis` inside the lib crashes if apis is
// missing. We construct a minimal registry entry with apis populated.
const initiaCosmosChain = {
  chain_id: INITIA_COSMOS_CHAIN_ID,
  chain_name: INITIA_COSMOS_CHAIN_ID,
  pretty_name: INITIA_CHAIN_PRETTY_NAME,
  network_type: "testnet",
  bech32_prefix: "init",
  fees: { fee_tokens: [{ denom: "GAS", fixed_min_gas_price: 0 }] },
  staking: { staking_tokens: [{ denom: "GAS" }] },
  apis: {
    rpc: [{ address: INITIA_COSMOS_RPC }],
    rest: [{ address: INITIA_REST }],
    "json-rpc": [{ address: INITIA_RPC }],
    indexer: [{ address: INITIA_REST }],
  },
  metadata: {
    is_l1: false,
    op_bridge_id: "1874",
    executor_uri: INITIA_REST,
    ibc_channels: [],
    minitia: { type: "minievm", version: "v1.2.15" },
  },
  logo_URIs: { png: "", svg: "" },
  evm_chain_id: INITIA_EVM_CHAIN_ID,
  // viem-friendly shorthands some code paths expect
  chainId: INITIA_COSMOS_CHAIN_ID,
  name: INITIA_CHAIN_PRETTY_NAME,
  logoUrl: "",
  rpcUrl: INITIA_RPC,
  restUrl: INITIA_REST,
};

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
          customChain={initiaCosmosChain as any}
        >
          <ChainGuard />
          {children}
        </InterwovenKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
