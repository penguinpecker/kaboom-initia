import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const pk = process.env.PRIVATE_KEY as `0x${string}`;
  const rpc = process.env.INITIA_RPC_URL;
  if (!pk || !rpc) throw new Error("Missing PRIVATE_KEY or INITIA_RPC_URL in .env");

  const account = privateKeyToAccount(pk);
  const client = createPublicClient({ transport: http(rpc) });

  console.log("Deployer address:", account.address);
  console.log("RPC:              ", rpc);

  const [chainId, blockNumber, balance] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getBalance({ address: account.address }),
  ]);

  console.log("Chain ID:         ", chainId);
  console.log("Latest block:     ", blockNumber.toString());
  console.log("Balance:          ", formatEther(balance), "INIT");

  if (balance === 0n) {
    console.log("\n⚠️  Zero balance. Fund this address before deploying.");
  } else {
    console.log("\n✓ Ready to deploy.");
  }
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exit(1); });
