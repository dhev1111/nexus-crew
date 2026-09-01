import { chatCompletionWithRetry, isLLMConfigured } from "@/lib/providers/llm";
import { V1_AGENTS, getV1Agent, DEFAULT_PIPELINE } from "./agents";
import {
  MissionState,
  createMissionState,
  updateStep,
  appendLog,
  addArtifact,
  AgentId,
  ApprovalRequest,
} from "./state";
import { clearMissionFiles } from "@/lib/tools";
import { storage } from "@/lib/storage";

const MAX_CONTEXT_CHARS = 12_000;
const GLOBAL_MAX_AGENT_ATTEMPTS = 2;

function selectContext(state: MissionState, upTo: AgentId): string {
  const parts: string[] = [`# User Mission\n${state.mission}`];
  let total = parts[0].length;

  for (const step of state.steps) {
    if (step.id === upTo) break;
    if (step.status !== "completed" || !step.output) continue;
    const chunk = `# ${step.name} Output\n${step.output}`;
    if (total + chunk.length > MAX_CONTEXT_CHARS) {
      const room = MAX_CONTEXT_CHARS - total - 80;
      if (room > 200) {
        parts.push(`# ${step.name} Output (trimmed)\n${step.output.slice(0, room)}…`);
      }
      break;
    }
    parts.push(chunk);
    total += chunk.length;
  }
  return parts.join("\n\n");
}

function mapField(agentId: AgentId, content: string, state: MissionState): MissionState {
  switch (agentId) {
    case "planner":
      return { ...state, plan: content };
    case "researcher":
      return { ...state, research: content };
    case "analyst":
      return { ...state, analysis: content };
    case "architect":
      return { ...state, architecture: content };
    case "builder":
    case "coder":
      return { ...state, code: content };
    case "designer":
      return { ...state, design: content };
    case "reviewer":
      return { ...state, review: content, finalResult: content };
    case "tester":
      return { ...state, tests: content };
    case "security":
      return { ...state, security: content };
    case "documenter":
      return { ...state, docs: content, finalResult: content };
    default:
      return state;
  }
}

function artifactTypeFor(
  agentId: AgentId
): "research" | "plan" | "architecture" | "code" | "design" | "report" | "test" | "docs" | "other" {
  switch (agentId) {
    case "researcher":
      return "research";
    case "planner":
      return "plan";
    case "architect":
      return "architecture";
    case "coder":
    case "builder":
      return "code";
    case "designer":
      return "design";
    case "tester":
      return "test";
    case "documenter":
    case "reviewer":
      return "report";
    default:
      return "other";
  }
}

function needsApprovalFromReview(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("request_changes") ||
    t.includes("request changes") ||
    (t.includes("approval recommendation") && t.includes("block"))
  );
}

export type StepCallback = (state: MissionState) => void | Promise<void>;

export async function runMission(
  mission: string,
  options?: {
    onStep?: StepCallback;
    pipeline?: AgentId[];
    demo?: boolean;
    existingId?: string;
  }
): Promise<MissionState> {
  let state = createMissionState(mission, { demo: options?.demo });
  if (options?.existingId) state = { ...state, id: options.existingId };

  clearMissionFiles();

  if (!mission || mission.trim().length < 3) {
    state.status = "failed";
    state.error = "Mission text is too short.";
    await storage.saveMission(state.id, state);
    return state;
  }

  if (!isLLMConfigured()) {
    state.status = "failed";
    state.error =
      "No AI backend configured. Set AI_ROUTER_URL for Free AI Router, or LLM_API_KEY for a direct provider.";
    state = appendLog(state, { level: "error", message: state.error });
    await storage.saveMission(state.id, state);
    return state;
  }

  const pipeline = options?.pipeline ?? DEFAULT_PIPELINE;

  state.steps = pipeline.map((id) => {
    const def = getV1Agent(id);
    return {
      id,
      name: def.name,
      status: "queued" as const,
      maxAttempts: def.maxAttempts ?? GLOBAL_MAX_AGENT_ATTEMPTS,
      attempt: 0,
    };
  });

  state.status = "running";
  state = appendLog(state, {
    level: "info",
    message: `Pipeline started (${pipeline.length} agents)`,
  });
  await storage.saveMission(state.id, state);
  await options?.onStep?.(state);

  for (const agentId of pipeline) {
    if (state.status === "cancelled") break;

    const def = getV1Agent(agentId);
    const maxAttempts = def.maxAttempts ?? GLOBAL_MAX_AGENT_ATTEMPTS;
    let success = false;
    let lastError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      state = updateStep(state, agentId, {
        status: attempt > 1 ? "retrying" : "running",
        startedAt: Date.now(),
        attempt,
        maxAttempts,
        error: undefined,
      });
      state = appendLog(state, {
        level: "info",
        agentId,
        message: `${def.name} started (attempt ${attempt}/${maxAttempts})`,
      });
      await storage.saveMission(state.id, state);
      await options?.onStep?.(state);

      try {
        const context = selectContext(state, agentId);
        const userMsg = `Context from previous agents:\n\n${context}\n\n---\nYour role: ${def.name}. Produce your deliverable now.`;

        const response = await chatCompletionWithRetry(
          [
            { role: "system", content: def.systemPrompt },
            { role: "user", content: userMsg },
          ],
          {
            temperature: 0.35,
            maxTokens: def.maxTokens ?? 1600,
            timeoutMs: def.timeoutMs ?? 55_000,
            preferFast: def.useFastModel,
          },
          2
        );

        const content = response.content.trim();
        state = updateStep(state, agentId, {
          status: "completed",
          output: content,
          finishedAt: Date.now(),
          attempt,
        });
        state = mapField(agentId, content, state);
        state = addArtifact(state, {
          type: artifactTypeFor(agentId),
          title: `${def.name} output`,
          creatorAgent: agentId,
          content,
        });
        state = appendLog(state, {
          level: "info",
          agentId,
          message: `${def.name} completed`,
          meta: {
            chars: content.length,
            model: response.model,
            provider: response.provider || "unknown",
          },
        });
        success = true;
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        state = updateStep(state, agentId, {
          status: attempt < maxAttempts ? "retrying" : "failed",
          error: lastError,
          finishedAt: Date.now(),
          attempt,
        });
        state = appendLog(state, {
          level: "error",
          agentId,
          message: `${def.name} error: ${lastError}`,
        });
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
    }

    if (!success) {
      state.status = "failed";
      state.error = `${def.name} failed after ${maxAttempts} attempts: ${lastError}`;
      await storage.saveMission(state.id, state);
      await options?.onStep?.(state);
      return state;
    }

    if (agentId === "reviewer") {
      const reviewText = state.steps.find((s) => s.id === "reviewer")?.output || "";
      if (needsApprovalFromReview(reviewText)) {
        const approval: ApprovalRequest = {
          id: `appr_${Date.now()}`,
          missionId: state.id,
          reason: "Reviewer requested changes or blocked the package",
          action: "other",
          status: "pending",
          createdAt: Date.now(),
        };
        state.approvals = [...state.approvals, approval];
        state.status = "awaiting_approval";
        state = updateStep(state, "reviewer", {
          needsApproval: true,
          approvalId: approval.id,
          status: "waiting_approval",
        });
        state = appendLog(state, {
          level: "warn",
          agentId: "reviewer",
          message: "Human approval required",
        });
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        return state;
      }
    }
  }

  if (state.status === "running") {
    state.status = "completed";
    state = appendLog(state, { level: "info", message: "Mission completed" });
  }

  state.updatedAt = Date.now();
  await storage.saveMission(state.id, state);
  await options?.onStep?.(state);
  return state;
}

export { V1_AGENTS, DEFAULT_PIPELINE };
