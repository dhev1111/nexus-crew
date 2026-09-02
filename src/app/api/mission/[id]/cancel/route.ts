import { NextRequest, NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import type { MissionState } from "@/lib/mission/state";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: { id: string } }
) {
  const { id } = ctx.params;
  const data = (await storage.getMission(id)) as MissionState | null;
  if (!data) {
    return NextResponse.json({ error: "mission not found" }, { status: 404 });
  }

  if (data.status === "completed" || data.status === "failed") {
    return NextResponse.json(
      { error: `cannot cancel ${data.status} mission` },
      { status: 409 }
    );
  }

  const now = Date.now();
  const next: MissionState = {
    ...data,
    status: "cancelled",
    updatedAt: now,
    steps: data.steps.map((s) =>
      s.status === "queued" || s.status === "running" || s.status === "retrying"
        ? { ...s, status: "cancelled" }
        : s
    ),
    logs: [
      ...data.logs,
      { ts: now, level: "warn" as const, message: "Mission cancelled" },
    ],
  };

  await storage.saveMission(id, next);
  return NextResponse.json({ ok: true, state: next });
}
