import { randomBytes } from "crypto";
import { keccak256, encodePacked, bytesToHex, hexToBytes } from "viem";
import type { SessionData } from "./session";

export const GRID_SIZE = 16;
export const MIN_MINES = 1;
export const MAX_MINES = 12;

function generateMineLayout(mineCount: number): number {
  const tiles: number[] = [];
  for (let i = 0; i < GRID_SIZE; i++) tiles.push(i);
  // Fisher-Yates with cryptographic rejection sampling
  for (let i = tiles.length - 1; i > 0; i--) {
    const maxVal = 256 - (256 % (i + 1));
    let r: number;
    do { r = randomBytes(1)[0]!; } while (r >= maxVal);
    const j = r % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  let layout = 0;
  for (let k = 0; k < mineCount; k++) layout |= 1 << tiles[tiles.length - 1 - k]!;
  return layout;
}

/**
 * Produces the same commitment the on-chain contract verifies:
 *   keccak256(abi.encodePacked(uint16 mineLayout, uint8 mineCount, bytes32 salt))
 * Encoded length is 2 + 1 + 32 = 35 bytes, same as Solidity packed encoding.
 */
export function computeCommitment(mineLayout: number, mineCount: number, salt: Uint8Array): `0x${string}` {
  const saltHex = bytesToHex(salt);
  const packed = encodePacked(
    ["uint16", "uint8", "bytes32"],
    [mineLayout, mineCount, saltHex],
  );
  return keccak256(packed);
}

export function createSession(player: string, mineCount: number): { session: SessionData; commitment: `0x${string}` } {
  if (mineCount < MIN_MINES || mineCount > MAX_MINES) throw new Error("Invalid mine count");
  const mineLayout = generateMineLayout(mineCount);
  const salt = new Uint8Array(randomBytes(32));
  const commitment = computeCommitment(mineLayout, mineCount, salt);
  const session: SessionData = {
    player: player.toLowerCase(),
    mineCount,
    mineLayout,
    salt: bytesToHex(salt),
    commitment,
    reveals: [],
    createdAt: Date.now(),
  };
  return { session, commitment };
}

export function checkTile(session: SessionData, tileIndex: number): { isMine: boolean; updatedSession: SessionData } {
  if (tileIndex < 0 || tileIndex >= GRID_SIZE) throw new Error("Invalid tile index");
  if (session.reveals.includes(tileIndex)) throw new Error("Tile already revealed");
  const isMine = (session.mineLayout & (1 << tileIndex)) !== 0;
  return { isMine, updatedSession: { ...session, reveals: [...session.reveals, tileIndex] } };
}

export function getSessionSalt(session: SessionData): `0x${string}` {
  return (session.salt.startsWith("0x") ? session.salt : "0x" + session.salt) as `0x${string}`;
}

export function getSaltBytes(session: SessionData): Uint8Array {
  return hexToBytes(getSessionSalt(session));
}
