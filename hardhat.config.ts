import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

// ─── INITIA MINIEVM ENDPOINTS ──────────────────────────────────────────────
//
// The canonical JSON-RPC for a MiniEVM rollup follows the pattern:
//   https://jsonrpc-<chain-id>.anvil.asia-southeast.initia.xyz
//
// The hackathon rules require that your submission be deployed as its own
// appchain/rollup, and Initia grants "Anvil Credits" to winners to run it on
// mainnet for 2-3 months. For the demo you will run against a dev Minitia or
// testnet; the code switches between them with just .env changes.
//
// Verified live MAINNET MiniEVM rollups (from initia-labs/initia-registry):
//
//   Cabal       chain_id=cabal-1         evm_chain_id=2630341494499703
//               json-rpc: https://jsonrpc-cabal-1.anvil.asia-southeast.initia.xyz
//   Embr        chain_id=embrmainnet-1   evm_chain_id=2598901095158506
//               json-rpc: https://jsonrpc-embrmainnet-1.anvil.asia-southeast.initia.xyz
//   Rave        chain_id=rave-1          evm_chain_id=555110192329996
//               json-rpc: https://jsonrpc-rave-1.anvil.asia-southeast.initia.xyz
//   Yominet    chain_id=yominet-1       evm_chain_id=428962654539583
//               json-rpc: https://jsonrpc-yominet-1.anvil.asia-southeast.initia.xyz
//
// Note: these four are dedicated app-chains — you cannot deploy third-party
// contracts to them. For your own "kaboom-1" Minitia, you'll receive a
// dedicated jsonrpc URL of the same form once Initia provisions it via Anvil
// Credits. Put that URL in .env as INITIA_RPC_URL.
// ─────────────────────────────────────────────────────────────────────────────

const INITIA_RPC = process.env.INITIA_RPC_URL || "https://jsonrpc-yominet-1.anvil.asia-southeast.initia.xyz";
const INITIA_CHAIN_ID = Number(process.env.INITIA_EVM_CHAIN_ID || "428962654539583");
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 10_000 },
      // MiniEVM rejects `mcopy` (Cancun opcode) on some Minitias — pin to shanghai.
      evmVersion: "shanghai",
      viaIR: true,
    },
  },
  networks: {
    hardhat: {},
    initia: {
      url: INITIA_RPC,
      chainId: INITIA_CHAIN_ID,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Initia's Blockscout is Etherscan-compatible.
    apiKey: {
      initia: "dummy",
    },
    customChains: [
      {
        network: "initia",
        chainId: INITIA_CHAIN_ID,
        urls: {
          apiURL: process.env.INITIA_SCAN_API || "https://scan.testnet.initia.xyz/api",
          browserURL: process.env.INITIA_SCAN_URL || "https://scan.testnet.initia.xyz",
        },
      },
    ],
  },
};

export default config;
