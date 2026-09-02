/**
 * Shared mission state / message bus for the agent pipeline.
 */

export type AgentStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "retrying"
  | "waiting_approval"
  | "skipped"
  | "cancelled";

export type MissionStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type AgentId =
  | "orchestrator"
  | "planner"
  | "researcher"
  | "analyst"
  | "architect"
  | "builder"
  | "coder"
  | "designer"
  | "reviewer"
  | "tester"
  | "security"
  | "deployer"
  | "documenter";

export interface Artifact {
  id: string;
  type:
    | "research"
    | "plan"
    | "architecture"
    | "code"
    | "design"
    | "report"
    | "test"
    | "docs"
    | "other";
  title: string;
  creatorAgent: AgentId;
  missionId: string;
  timestamp: number;
  content: string;
  version: number;
}

export interface ToolCallRecord {
  tool: string;
  input: string;
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface AgentStep {
  id: AgentId;
  name: string;
  status: AgentStatus;
  output?: string;
  structured?: Record<string, unknown>;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  attempt?: number;
  maxAttempts?: number;
  toolCalls?: ToolCallRecord[];
  needsApproval?: boolean;
  approvalId?: string;
}

export interface ApprovalRequest {
  id: string;
  missionId: string;
  reason: string;
  action: "deploy" | "publish" | "external" | "spend" | "destructive" | "other";
  status: ApprovalStatus;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface MissionLogEntry {
  ts: number;
  level: "info" | "warn" | "error";
  agentId?: AgentId;
  message: string;
  meta?: Record<string, unknown>;
}

export interface MissionState {
  id: string;
  mission: string;
  status: MissionStatus;
  plan?: string;
  research?: string;
  analysis?: string;
  architecture?: string;
  code?: string;
  design?: string;
  review?: string;
  tests?: string;
  security?: string;
  docs?: string;
  finalResult?: string;
  steps: AgentStep[];
  artifacts: Artifact[];
  approvals: ApprovalRequest[];
  logs: MissionLogEntry[];
  createdAt: number;
  updatedAt: number;
  error?: string;
  demo?: boolean;
}

export function createMissionState(mission: string, opts?: { demo?: boolean }): MissionState {
  const now = Date.now();
  const id = `mission_${now}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    mission: mission.trim(),
    status: "pending",
    steps: [],
    artifacts: [],
    approvals: [],
    logs: [
      {
        ts: now,
        level: "info",
        message: "Mission created",
        meta: { missionLength: mission.trim().length },
      },
    ],
    createdAt: now,
    updatedAt: now,
    demo: opts?.demo,
  };
}

export function updateStep(
  state: MissionState,
  agentId: AgentId,
  patch: Partial<AgentStep>
): MissionState {
  const idx = state.steps.findIndex((s) => s.id === agentId);
  let steps: AgentStep[];
  if (idx >= 0) {
    steps = state.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
  } else {
    steps = [
      ...state.steps,
      {
        id: agentId,
        name: agentId,
        status: "queued",
        ...patch,
      } as AgentStep,
    ];
  }
  return { ...state, updatedAt: Date.now(), steps };
}

export function appendLog(
  state: MissionState,
  entry: Omit<MissionLogEntry, "ts">
): MissionState {
  return {
    ...state,
    updatedAt: Date.now(),
    logs: [...state.logs, { ...entry, ts: Date.now() }].slice(-200),
  };
}

export function addArtifact(
  state: MissionState,
  artifact: Omit<Artifact, "id" | "missionId" | "timestamp" | "version">
): MissionState {
  const art: Artifact = {
    ...artifact,
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    missionId: state.id,
    timestamp: Date.now(),
    version: 1,
  };
  return {
    ...state,
    updatedAt: Date.now(),
    artifacts: [...state.artifacts, art],
  };
}
