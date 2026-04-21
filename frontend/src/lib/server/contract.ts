import { KABOOM_ABI } from "@/lib/chain";
import { getHouseClient, getPublicClient, KABOOM_ADDRESS } from "./config";

export type HouseFn =
  | "revealTile"
  | "settleGame"
  | "closeGame"
  | "fundVault";

export async function sendHouseTx(functionName: HouseFn, args: any[], value?: bigint): Promise<`0x${string}`> {
  const client = getHouseClient();
  const hash = await client.writeContract({
    address: KABOOM_ADDRESS(),
    abi: KABOOM_ABI,
    functionName,
    args,
    value,
  });
  return hash;
}

export async function waitForTx(hash: `0x${string}`) {
  const pc = getPublicClient();
  return await pc.waitForTransactionReceipt({ hash, timeout: 30_000 });
}

/**
 * Pulls the on-chain GameSession for a given player. Returns null if the
 * session slot is empty (status == 0 == None).
 */
export async function readGame(player: string) {
  const pc = getPublicClient();
  const g = await pc.readContract({
    address: KABOOM_ADDRESS(),
    abi: KABOOM_ABI,
    functionName: "games",
    args: [player as `0x${string}`],
  }) as any;

  // wagmi/viem return tuples as arrays with named props when the ABI specifies
  // them — handle both to be safe.
  const status = Number(g.status ?? g[0]);
  if (status === 0) return null;

  return {
    status,
    mineCount:         Number(g.mineCount         ?? g[1]),
    safeReveals:       Number(g.safeReveals       ?? g[2]),
    revealedMask:      Number(g.revealedMask      ?? g[3]),
    revealedSafeMask:  Number(g.revealedSafeMask  ?? g[4]),
    mineLayout:        Number(g.mineLayout        ?? g[5]),
    multiplierBps:     BigInt(g.multiplierBps     ?? g[6]),
    startTime:         BigInt(g.startTime         ?? g[7]),
    settled:          Boolean(g.settled           ?? g[8]),
    bet:               BigInt(g.bet               ?? g[9]),
    commitment:              (g.commitment        ?? g[10]) as `0x${string}`,
    salt:                    (g.salt              ?? g[11]) as `0x${string}`,
  };
}
