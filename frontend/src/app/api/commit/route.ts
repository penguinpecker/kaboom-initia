import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { createSession, MIN_MINES, MAX_MINES } from "@/lib/server/game";
import { encryptSession } from "@/lib/server/session";
import { readGame } from "@/lib/server/contract";

export async function POST(req: NextRequest) {
  try {
    const { player, mineCount, betWei } = await req.json();
    if (!player || mineCount === undefined || !betWei) {
      return NextResponse.json({ error: "Missing player, mineCount, or betWei" }, { status: 400 });
    }
    if (!isAddress(player)) {
      return NextResponse.json({ error: "Invalid player address" }, { status: 400 });
    }

    const mc = Number(mineCount);
    if (mc < MIN_MINES || mc > MAX_MINES) {
      return NextResponse.json({ error: `Mine count must be ${MIN_MINES}-${MAX_MINES}` }, { status: 400 });
    }
    try {
      if (BigInt(betWei) < 1_000_000_000_000_000n /* 0.001 INIT */) {
        return NextResponse.json({ error: "Min bet 0.001 INIT" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid bet" }, { status: 400 });
    }

    // Refuse to create a new commitment if the player already has an active game
    // on-chain. The UI will surface this and prompt the user to close or refund.
    const existing = await readGame(player);
    if (existing && existing.status === 1 /* Playing */) {
      return NextResponse.json(
        { error: "Active game exists. Close it first.", needsCleanup: true },
        { status: 409 },
      );
    }

    const { session, commitment } = createSession(player, mc);
    const gameToken = encryptSession(session);

    return NextResponse.json({
      commitment,       // 0x-prefixed bytes32, pass directly to startGame()
      gameToken,        // opaque encrypted session the client echoes back
    });
  } catch (err: any) {
    console.error("Commit error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
