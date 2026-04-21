import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSessionSalt } from "@/lib/server/game";
import { decryptSession } from "@/lib/server/session";
import { sendHouseTx, waitForTx } from "@/lib/server/contract";

/**
 * Called by the client immediately after cashOut. The client has already
 * signed cashOut() which put the game in status=Won; the server now reveals
 * the mine layout + salt so verifyGame() returns true forever. Then it frees
 * the game slot with closeGame so the player can start a new round.
 */
export async function POST(req: NextRequest) {
  try {
    const { player, gameToken } = await req.json();
    if (!player || !gameToken) {
      return NextResponse.json({ error: "Missing player or gameToken" }, { status: 400 });
    }
    if (!isAddress(player)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    let session;
    try { session = decryptSession(gameToken); }
    catch { return NextResponse.json({ error: "Invalid game token" }, { status: 400 }); }

    if (session.player.toLowerCase() !== player.toLowerCase()) {
      return NextResponse.json({ error: "Token player mismatch" }, { status: 403 });
    }

    const salt = getSessionSalt(session);

    // Wait briefly for cashOut() to mine before we try settleGame
    await new Promise((r) => setTimeout(r, 1500));

    const settleTx = await sendHouseTx("settleGame", [
      player, session.mineLayout, salt,
    ]);
    await waitForTx(settleTx);

    let closeTx: `0x${string}` | undefined;
    try {
      closeTx = await sendHouseTx("closeGame", [player]);
    } catch (e: any) {
      console.error("close after settle:", e?.shortMessage || e?.message);
    }

    return NextResponse.json({
      settleTx,
      closeTx,
      mineLayout: session.mineLayout,
      verified: true,
    });
  } catch (err: any) {
    console.error("Settle error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
