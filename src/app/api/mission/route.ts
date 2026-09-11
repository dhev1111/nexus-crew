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

    const llmConfigured = isLLMConfigured();

    if (stream) {
      const encoder = new TextEncoder();
      let closed = false;

      const readable = new ReadableStream({
        async start(controller) {
          const BUDGET_MS = 240_000;
          const budgetTimer = setTimeout(() => {
            if (closed) return;
            const timeoutState = {
              id: `mission_timeout_${Date.now()}`,
              mission,
              status: "failed" as const,
              error: "Mission timed out. The server execution budget was exceeded. Please try a shorter mission or retry later.",
              steps: [],
              artifacts: [],
              approvals: [],
              logs: [{ ts: Date.now(), level: "error" as const, message: "Server execution budget exceeded" }],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            send("step", timeoutState);
            send("done", timeoutState);
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
          }, BUDGET_MS);

          const send = (event: string, data: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch (err) {
              console.error("[api/mission] SSE enqueue failed:", err instanceof Error ? err.message : "unknown");
              closed = true;
            }
          };

          if (!llmConfigured) {
            const errState = {
              id: `mission_err_${Date.now()}`,
              mission,
              status: "failed" as const,
              error: "No AI backend configured. Set GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY for the internal gateway, or AI_ROUTER_URL for an external router.",
              steps: [],
              artifacts: [],
              approvals: [],
              logs: [{ ts: Date.now(), level: "error" as const, message: "No AI backend configured" }],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            send("step", errState);
            send("done", errState);
            closed = true;
            clearTimeout(budgetTimer);
            controller.close();
            return;
          }

          try {
            const state = await runMission(mission, {
              demo,
              onStep: async (s: MissionState) => {
                send("step", s);
              },
            });
            send("done", state);
          } catch (err) {
            const errorState = {
              id: `mission_err_${Date.now()}`,
              mission,
              status: "failed" as const,
              error: err instanceof Error ? err.message : "Pipeline error",
              steps: [],
              artifacts: [],
              approvals: [],
              logs: [{ ts: Date.now(), level: "error" as const, message: err instanceof Error ? err.message : "Pipeline error" }],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            send("step", errorState);
            send("done", errorState);
          } finally {
            clearTimeout(budgetTimer);
            closed = true;
            try { controller.close(); } catch { /* already closed */ }
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

    if (!llmConfigured) {
      return NextResponse.json(
        {
          error:
            "No AI backend configured. Set GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY for the internal gateway, or AI_ROUTER_URL for an external router.",
          configured: false,
        },
        { status: 503 }
      );
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
