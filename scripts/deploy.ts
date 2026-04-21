import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const houseAuthority = process.env.HOUSE_AUTHORITY || deployer.address;

  // 2% house edge, 2% max bet, 10% max payout — matches the Solana version.
  const HOUSE_EDGE_BPS = 200;
  const MAX_BET_BPS = 200;
  const MAX_PAYOUT_BPS = 1000;

  console.log("Network:           ", network.name);
  console.log("Deployer:          ", deployer.address);
  console.log("Deployer balance:  ", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "INIT");
  console.log("House authority:   ", houseAuthority);
  console.log("House edge:        ", HOUSE_EDGE_BPS / 100, "%");

  const Kaboom = await ethers.getContractFactory("Kaboom");
  const kaboom = await Kaboom.deploy(houseAuthority, HOUSE_EDGE_BPS, MAX_BET_BPS, MAX_PAYOUT_BPS);
  await kaboom.waitForDeployment();
  const addr = await kaboom.getAddress();

  // Fund the vault with 0.5 INIT so players can actually bet immediately.
  const seed = process.env.SEED_VAULT ?? "0.5";
  if (seed !== "0") {
    const tx = await deployer.sendTransaction({ to: addr, value: ethers.parseEther(seed) });
    await tx.wait();
    console.log("Seeded vault with", seed, "INIT");
  }

  console.log("\n✓ Kaboom deployed at:", addr);

  // Emit a JSON artifact the frontend imports.
  const out = {
    address: addr,
    houseAuthority,
    houseEdgeBps: HOUSE_EDGE_BPS,
    maxBetBps: MAX_BET_BPS,
    maxPayoutBps: MAX_PAYOUT_BPS,
    network: network.name,
    chainId: Number(network.config.chainId ?? 0),
    deployedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
