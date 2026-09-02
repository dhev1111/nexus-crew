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

  const now = Date.now();
  const next: MissionState = {
    ...data,
    status: "failed",
    error: "Rejected by human",
    updatedAt: now,
    approvals: data.approvals.map((a) =>
      a.status === "pending"
        ? { ...a, status: "rejected", resolvedAt: now, resolvedBy: "user" }
        : a
    ),
    steps: data.steps.map((s) =>
      s.status === "waiting_approval" ? { ...s, status: "failed" } : s
    ),
    logs: [
      ...data.logs,
      { ts: now, level: "warn" as const, message: "Mission rejected by human" },
    ],
  };

  await storage.saveMission(id, next);
  return NextResponse.json({ ok: true, state: next });
}
