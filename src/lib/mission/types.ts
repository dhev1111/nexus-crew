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

export type StageStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "timed_out"
  | "repairing"
  | "skipped";

export type VerificationStatus = "unverified" | "passing" | "failing" | "not_applicable";

export interface BuildEvidence {
  passed: boolean;
  details?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface TestEvidence {
  passed: boolean;
  total?: number;
  failed?: number;
  details?: string;
  durationMs?: number;
}

export interface RuntimeEvidence {
  started: boolean;
  healthy?: boolean;
  details?: string;
  exitCode?: number;
  durationMs?: number;
}

export interface ProductFlowCheck {
  name: string;
  passed: boolean;
  details?: string;
}

export interface ProductFlowEvidence {
  verified: boolean;
  checks: ProductFlowCheck[];
}

export interface VerificationEvidence {
  build?: BuildEvidence;
  tests?: TestEvidence;
  runtime?: RuntimeEvidence;
  productFlow?: ProductFlowEvidence;
}

export type ProductResult =
  | "code_generated"
  | "build_passed"
  | "tests_passed"
  | "runtime_started"
  | "runtime_verified"
  | "product_flow_verified"
  | "delivery_ready";

export interface ExecutionResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

export interface ExecutionRequest {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
}

export interface RepairAttempt {
  attempt: number;
  maxAttempts: number;
  diagnosis: string;
  action: string;
  result?: ExecutionResult;
  verified?: boolean;
}

export interface StageProgress {
  stage: string;
  status: string;
  startedAt?: number;
  finishedAt?: number;
  evidence?: string;
}

export function isTerminalStageStatus(status: StageStatus): boolean {
  return ["completed", "failed", "blocked", "timed_out"].includes(status);
}

export function isRepairableStage(status: StageStatus): boolean {
  return status === "failed";
}

export function canCompleteMission(evidence: VerificationEvidence): boolean {
  if (evidence.build && !evidence.build.passed) return false;
  if (evidence.tests && !evidence.tests.passed) return false;
  if (evidence.runtime && evidence.runtime.started && !evidence.runtime.healthy) return false;
  if (evidence.productFlow && !evidence.productFlow.verified) return false;
  return true;
}

export function hasAnyVerification(evidence: VerificationEvidence): boolean {
  return (
    evidence.build !== undefined ||
    evidence.tests !== undefined ||
    evidence.runtime !== undefined ||
    evidence.productFlow !== undefined
  );
}