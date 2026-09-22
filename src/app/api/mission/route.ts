import { NextRequest, NextResponse } from "next/server";
import { runMission } from "@/lib/mission/orchestrate";
import { isLLMConfigured } from "@/lib/providers/llm";
import { isRouterConfigured } from "@/lib/ai-router";
import { storage } from "@/lib/storage";
import type { MissionState } from "@/lib/mission/state";

export const runtime = "nodejs";
export const maxDuration = 300;

const TERMINAL_STATUSES = new Set(["completed", "failed", "blocked", "timed_out", "cancelled"]);
const EMITTED_TERMINALS = new Set<string>();

function isTerminal(state: MissionState): boolean {
  return TERMINAL_STATUSES.has(state.status);
}

function createTimeoutState(mission: string): MissionState {
  return {
    id: `mission_timeout_${Date.now()}`,
    mission,
    status: "timed_out",
    error: "Mission timed out. The server execution budget was exceeded. Please try a shorter mission or retry later.",
    steps: [],
    artifacts: [],
    approvals: [],
    logs: [{ ts: Date.now(), level: "error" as const, message: "Server execution budget exceeded" }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    verification: {},
    productResult: "code_generated",
    stageProgress: [{ stage: "timeout", status: "timed_out", evidence: "Server execution budget exceeded" }],
  };
}

function createErrorState(mission: string, error: string): MissionState {
  return {
    id: `mission_err_${Date.now()}`,
    mission,
    status: "failed",
    error,
    steps: [],
    artifacts: [],
    approvals: [],
    logs: [{ ts: Date.now(), level: "error" as const, message: error }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    verification: {},
    productResult: "code_generated",
  };
}

function sendTerminal(controller: { enqueue: (data: Uint8Array) => void; close: () => void }, encoder: TextEncoder, state: MissionState, closed: { value: boolean }) {
  if (closed.value) return;
  const terminalKey = `${state.id}-${state.status}`;
  if (EMITTED_TERMINALS.has(terminalKey)) return;
  EMITTED_TERMINALS.add(terminalKey);
  try {
    controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify(state)}\n\n`));
  } catch { /* already closed */ }
}

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
      const readable = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let closed = { value: false };

          const BUDGET_MS = 240_000;
          const budgetTimer = setTimeout(() => {
            if (closed.value) return;
            const timeoutState = createTimeoutState(mission);
            controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(timeoutState)}\n\n`));
            sendTerminal(controller, encoder, timeoutState, closed);
            closed.value = true;
            try { controller.close(); } catch { /* already closed */ }
          }, BUDGET_MS);

          const send = (event: string, data: unknown) => {
            if (closed.value) return;
            try {
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
              );
            } catch (err) {
              console.error("[api/mission] SSE enqueue failed:", err instanceof Error ? err.message : "unknown");
              closed.value = true;
            }
          };

          if (!llmConfigured) {
            const errState = createErrorState(mission, "No AI backend configured. Set GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY for the internal gateway, or AI_ROUTER_URL for an external router.");
            send("step", errState);
            sendTerminal(controller, encoder, errState, closed);
            closed.value = true;
            clearTimeout(budgetTimer);
            controller.close();
            return;
          }

          try {
            const state = await runMission(mission, {
              demo,
              onStep: async (s: MissionState) => {
                send("step", s);
                if (isTerminal(s) && !EMITTED_TERMINALS.has(`${s.id}-${s.status}`)) {
                  sendTerminal(controller, encoder, s, closed);
                }
              },
            });
            if (!EMITTED_TERMINALS.has(`${state.id}-${state.status}`)) {
              sendTerminal(controller, encoder, state, closed);
            }
          } catch (err) {
            const errorState = createErrorState(mission, err instanceof Error ? err.message : "Pipeline error");
            send("step", errorState);
            sendTerminal(controller, encoder, errorState, closed);
          } finally {
            clearTimeout(budgetTimer);
            closed.value = true;
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
