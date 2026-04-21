import { NextResponse } from "next/server";
import { getHouseAccount, getPublicClient } from "@/lib/server/config";

export async function GET() {
  try {
    const pc = getPublicClient();
    const house = getHouseAccount();
    const [blockNumber, balance] = await Promise.all([
      pc.getBlockNumber(),
      pc.getBalance({ address: house.address }),
    ]);
    return NextResponse.json({
      ok: true,
      houseAddress: house.address,
      houseBalance: balance.toString(),
      blockNumber: blockNumber.toString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
