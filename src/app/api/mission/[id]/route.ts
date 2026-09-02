import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import type { MissionState } from "@/lib/mission/state";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: { id: string } }
) {
  const { id } = ctx.params;
  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }
  const data = (await storage.getMission(id)) as MissionState | null;
  if (!data) {
    return NextResponse.json({ error: "mission not found" }, { status: 404 });
  }
  return NextResponse.json({ state: data });
}
