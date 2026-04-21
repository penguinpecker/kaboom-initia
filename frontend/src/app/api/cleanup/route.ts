import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { getSessionSalt } from "@/lib/server/game";
import { decryptSession } from "@/lib/server/session";
import { readGame, sendHouseTx } from "@/lib/server/contract";

const EXPIRY_SECONDS = 300;

/**
 * Best-effort recovery when the client thinks it has a stuck game:
 *   - if on-chain status is Won/Lost and unsettled → settle (if we have token) + close
 *   - if still Playing and expired          → return { canRefund: true }
 *     The player has to call refundExpired() themselves (it sends funds back
 *     to their address), so the route just reports eligibility.
 */
export async function POST(req: NextRequest) {
  try {
    const { player, gameToken } = await req.json();
    if (!player) return NextResponse.json({ error: "Missing player" }, { status: 400 });
    if (!isAddress(player)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });

    const game = await readGame(player);
    if (!game) return NextResponse.json({ active: false });

    // 2 = Won, 3 = Lost
    if (game.status === 2 || game.status === 3) {
      let settleTx: `0x${string}` | undefined;
      let closeTx:  `0x${string}` | undefined;

      if (!game.settled && gameToken) {
        try {
          const session = decryptSession(gameToken);
          settleTx = await sendHouseTx("settleGame", [
            player, session.mineLayout, getSessionSalt(session),
          ]);
        } catch (e: any) {
          console.error("cleanup settle:", e?.shortMessage || e?.message);
        }
      }
      try {
        closeTx = await sendHouseTx("closeGame", [player]);
      } catch (e: any) {
        console.error("cleanup close:", e?.shortMessage || e?.message);
      }
      return NextResponse.json({ active: true, finished: true, settleTx, closeTx });
    }

    // status === 1 (Playing)
    const now = Math.floor(Date.now() / 1000);
    const expired = now > Number(game.startTime) + EXPIRY_SECONDS;
    return NextResponse.json({
      active: true,
      playing: true,
      canRefund: expired,
      secondsLeft: expired ? 0 : Number(game.startTime) + EXPIRY_SECONDS - now,
    });
  } catch (err: any) {
    console.error("Cleanup error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
