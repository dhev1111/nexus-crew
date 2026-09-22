import { chatCompletionWithRetry, isLLMConfigured } from "@/lib/providers/llm";
import { V1_AGENTS, getV1Agent, DEFAULT_PIPELINE } from "./agents";
import {
  MissionState,
  createMissionState,
  updateStep,
  appendLog,
  addArtifact,
  ApprovalRequest,
} from "./state";
import { clearMissionFiles } from "@/lib/tools";
import { storage } from "@/lib/storage";
import { emitExecution, emitAgent, emitAgentError } from "@/lib/observability";
import { canCompleteMission, hasAnyVerification } from "./types";
import { verifyMission } from "./verification";
import { repairLoop } from "./repair";
import type { VerificationEvidence, StageProgress, AgentId } from "./types";

const MAX_CONTEXT_CHARS = 12_000;
const GLOBAL_MAX_AGENT_ATTEMPTS = 2;
const MAX_REPAIR_ATTEMPTS = 3;

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

function addStageProgress(
  state: MissionState,
  stage: string,
  status: string,
  evidence?: string
): MissionState {
  const existing = state.stageProgress ?? [];
  const idx = existing.findIndex((s) => s.stage === stage);
  const entry = {
    stage,
    status,
    startedAt: status === "running" ? Date.now() : undefined,
    finishedAt: ["completed", "failed", "blocked", "timed_out"].includes(status) ? Date.now() : undefined,
    evidence,
  };
  const next = idx >= 0 ? [...existing] : [...existing];
  if (idx >= 0) {
    next[idx] = entry;
  } else {
    next.push(entry);
  }
  return { ...state, stageProgress: next };
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
    state = appendLog(state, { level: "error", message: state.error });
    await storage.saveMission(state.id, state);
    return state;
  }

  if (!isLLMConfigured()) {
    state.status = "blocked";
    state.error =
      "No AI backend configured. Set GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY for the internal gateway, or AI_ROUTER_URL for an external router.";
    state = appendLog(state, { level: "error", message: state.error });
    emitExecution("execution.failed", state.error!, state.id);
    await storage.saveMission(state.id, state);
    return state;
  }

  const pipeline = options?.pipeline ?? DEFAULT_PIPELINE;

  state.stageProgress = (state.stageProgress ?? []).concat(
    pipeline.map((id) => ({ stage: id, status: "queued" as const }))
  );

  state.status = "running";
  state = appendLog(state, {
    level: "info",
    message: `Pipeline started (${pipeline.length} agents)`,
  });
  emitExecution("execution.started", `Pipeline started: ${pipeline.length} agents`, state.id, {
    pipeline: pipeline.join(", "),
  });
  await storage.saveMission(state.id, state);
  await options?.onStep?.(state);

  let failedAgent: AgentId | undefined = undefined;
  let lastError = "";
  let successAgentCount = 0;

  for (const agentId of pipeline) {
    if (state.status === "cancelled") break;

    const def = getV1Agent(agentId);
    const maxAttempts = def.maxAttempts ?? GLOBAL_MAX_AGENT_ATTEMPTS;
    let success = false;
    lastError = "";

    state = addStageProgress(state, agentId, "running");

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
      emitAgent("agent.started", `${def.name} started (attempt ${attempt}/${maxAttempts})`, state.id, agentId, { attempt, maxAttempts });
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
        if (!content) {
          throw new Error(`${def.name} returned empty content`);
        }

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
        emitAgent("agent.completed", `${def.name} completed (${content.length} chars)`, state.id, agentId, {
          chars: content.length,
          model: response.model,
          provider: response.provider || "unknown",
        });
        success = true;
        state = addStageProgress(state, agentId, "completed");
        successAgentCount++;
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
        emitAgentError("agent.failed", `${def.name} failed: ${lastError}`, state.id, agentId, { attempt, error: lastError });
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
    }

    if (!success) {
      failedAgent = agentId;
      state = addStageProgress(state, agentId, "failed", lastError);
      break;
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
        emitExecution("execution.awaiting_approval", "Human approval required", state.id);
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        return state;
      }
    }
  }

  if (failedAgent) {
    state.status = "blocked";
    state.error = `${failedAgent} failed after ${getV1Agent(failedAgent).maxAttempts ?? GLOBAL_MAX_AGENT_ATTEMPTS} attempts: ${lastError}`;
    state.finalResult = state.finalResult || `Execution blocked at ${failedAgent}`;
    state = appendLog(state, { level: "error", message: state.error });
    emitExecution("execution.blocked", state.error!, state.id, { blockedAgent: failedAgent });
    await storage.saveMission(state.id, state);
    await options?.onStep?.(state);
    return state;
  }

  if (state.status === "running") {
    const verificationEvidence = await runVerification(state);
    state.verification = verificationEvidence;

    if (verificationEvidence.build && !verificationEvidence.build.passed) {
      const { evidence: repairedEvidence, attempts, success: repairSuccess } = await repairLoop(
        process.cwd(),
        verificationEvidence,
        MAX_REPAIR_ATTEMPTS
      );
      state.verification = repairedEvidence;
      state.stageProgress = [
        ...(state.stageProgress ?? []),
        { stage: "repair", status: repairSuccess ? "completed" : "failed", evidence: `${attempts.length} repair attempts` },
      ];

      if (!repairSuccess) {
        state.status = "failed";
        state.error = `Repair limit reached (${MAX_REPAIR_ATTEMPTS} attempts). Build could not be verified.`;
        state.productResult = "code_generated";
        state = appendLog(state, { level: "error", message: state.error });
        emitExecution("execution.failed", state.error!, state.id, { reason: "repair_limit_reached" });
        await storage.saveMission(state.id, state);
        await options?.onStep?.(state);
        return state;
      }
    }

    const { verified, status: verificationStatus } = verifyMission(state.verification ?? {});

    if (verified || !hasAnyVerification(state.verification ?? {})) {
      state.status = "completed";
      state.productResult = verified ? "delivery_ready" : "code_generated";
      if (!state.finalResult) {
        const lastCompleted = [...state.steps].reverse().find((s) => s.status === "completed" && s.output);
        state.finalResult = lastCompleted?.output || "Mission completed successfully.";
      }
      state = appendLog(state, { level: "info", message: "Mission completed" });
      emitExecution("execution.completed", "Mission completed successfully", state.id, {
        stepsCompleted: successAgentCount,
        totalSteps: pipeline.length,
        verified,
        productResult: state.productResult,
      });
    } else {
      state.status = "failed";
      state.error = `Verification failed: ${verificationStatus}`;
      state.productResult = "code_generated";
      state = appendLog(state, { level: "error", message: state.error });
      emitExecution("execution.failed", state.error!, state.id, { reason: "verification_failed", verificationStatus });
      await storage.saveMission(state.id, state);
      await options?.onStep?.(state);
      return state;
    }
  }

  state.updatedAt = Date.now();
  await storage.saveMission(state.id, state);
  await options?.onStep?.(state);
  return state;
}

async function runVerification(state: MissionState): Promise<VerificationEvidence> {
  const evidence: VerificationEvidence = {};
  const code = state.code ?? "";

  if (code && code.length > 0) {
    const { runBuild } = await import("./execution");
    const buildResult = await runBuild(process.cwd(), 120_000);
    evidence.build = {
      passed: buildResult.ok,
      details: buildResult.ok ? "Build succeeded" : (buildResult.stderr?.slice(0, 500) ?? "Build failed"),
      exitCode: buildResult.exitCode ?? undefined,
      durationMs: buildResult.durationMs,
    };

    if (buildResult.ok) {
      const { runTest } = await import("./execution");
      const testResult = await runTest(process.cwd(), 120_000);
      evidence.tests = {
        passed: testResult.ok,
        details: testResult.ok ? "Tests passed" : (testResult.stderr?.slice(0, 500) ?? "Tests failed"),
        durationMs: testResult.durationMs,
      };
    }
  }

  return evidence;
}

export { V1_AGENTS, DEFAULT_PIPELINE, MAX_REPAIR_ATTEMPTS };
