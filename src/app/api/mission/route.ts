import { NextRequest, NextResponse } from "next/server";
import { runMission } from "@/lib/mission/orchestrate";
import { isLLMConfigured } from "@/lib/providers/llm";
import { isRouterConfigured } from "@/lib/ai-router";
import { storage } from "@/lib/storage";
import type { MissionState } from "@/lib/mission/state";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mission = typeof body.mission === "string" ? body.mission.trim() : "";
    const stream = Boolean(body.stream);
    const demo = Boolean(body.demo);

    if (!mission || mission.length < 3) {
      return NextResponse.json(
        { error: "mission is required (min 3 characters)" },
        { status: 400 }
      );
    }
    if (mission.length > 4000) {
      return NextResponse.json(
        { error: "mission is too long (max 4000 characters)" },
        { status: 400 }
      );
    }

    if (!isLLMConfigured()) {
      return NextResponse.json(
        {
          error:
            "No AI backend configured. Set AI_ROUTER_URL (Free AI Router) or LLM_API_KEY in environment variables.",
          configured: false,
        },
        { status: 503 }
      );
    }

    if (stream) {
      const encoder = new TextEncoder();
      let closed = false;

      const readable = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            if (closed) return;
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };

          try {
            const state = await runMission(mission, {
              demo,
              onStep: async (s: MissionState) => {
                send("step", s);
              },
            });
            send("done", state);
          } catch (err) {
            send("error", {
              error: err instanceof Error ? err.message : "Pipeline error",
            });
          } finally {
            closed = true;
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const state = await runMission(mission, { demo });
    return NextResponse.json({
      ok: state.status === "completed" || state.status === "awaiting_approval",
      state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("[api/mission]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const list = await storage.listMissions(30);
  return NextResponse.json({
    service: "Nexus Crew Mission API",
    llmConfigured: isLLMConfigured(),
    routerConfigured: isRouterConfigured(),
    missions: list,
  });
}
