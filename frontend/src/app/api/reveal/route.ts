import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { checkTile, getSessionSalt, GRID_SIZE } from "@/lib/server/game";
import { decryptSession, encryptSession } from "@/lib/server/session";
import { sendHouseTx, waitForTx } from "@/lib/server/contract";

export async function POST(req: NextRequest) {
  try {
    const { player, tileIndex, gameToken } = await req.json();
    if (!player || tileIndex === undefined || !gameToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!isAddress(player)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const idx = Number(tileIndex);
    if (idx < 0 || idx >= GRID_SIZE) {
      return NextResponse.json({ error: "Invalid tile" }, { status: 400 });
    }

    let session;
    try { session = decryptSession(gameToken); }
    catch { return NextResponse.json({ error: "Invalid game token" }, { status: 400 }); }

    if (session.player.toLowerCase() !== player.toLowerCase()) {
      return NextResponse.json({ error: "Player mismatch" }, { status: 403 });
    }

    const { isMine, updatedSession } = checkTile(session, idx);

    // 1. House signs revealTile on-chain
    const revealTx = await sendHouseTx("revealTile", [
      player,
      idx,
      isMine,
    ]);

    // We don't block the response on confirmation — but if the tile is a mine
    // we atomically settle + close next so the user can start a new round
    // right away.
    let settleTx: `0x${string}` | undefined;
    let closeTx:  `0x${string}` | undefined;

    if (isMine) {
      try {
        // Wait for the reveal to land so settle sees status=Lost
        await waitForTx(revealTx);
        settleTx = await sendHouseTx("settleGame", [
          player,
          updatedSession.mineLayout,
          getSessionSalt(updatedSession),
        ]);
        await waitForTx(settleTx);
        closeTx = await sendHouseTx("closeGame", [player]);
      } catch (e: any) {
        console.error("settle-on-loss failed:", e?.shortMessage || e?.message);
      }
    }

    const safeReveals = updatedSession.reveals.filter(
      (t: number) => (updatedSession.mineLayout & (1 << t)) === 0
    ).length;

    return NextResponse.json({
      isMine,
      tileIndex: idx,
      revealTx,
      settleTx,
      closeTx,
      safeReveals,
      gameToken: encryptSession(updatedSession),
    });
  } catch (err: any) {
    console.error("Reveal error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
