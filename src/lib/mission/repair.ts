import type { ExecutionResult, RepairAttempt, VerificationEvidence } from "./types";
import { execute } from "./execution";
import { markBuild, verifyMission } from "./verification";

const DEFAULT_MAX_REPAIRS = 3;

interface RepairAction {
  diagnose(error: ExecutionResult): string;
  action(): string[];
}

const DEFAULT_REPAIR_ACTIONS: RepairAction[] = [
  {
    diagnose: (err) => `Build failed: ${err.stderr?.slice(0, 200) ?? err.error ?? "unknown error"}`,
    action: () => ["npm", "run", "build"],
  },
];

export async function repairLoop(
  cwd: string,
  evidence: VerificationEvidence,
  maxAttempts: number = DEFAULT_MAX_REPAIRS
): Promise<{ evidence: VerificationEvidence; attempts: RepairAttempt[]; success: boolean }> {
  const attempts: RepairAttempt[] = [];
  let currentEvidence = { ...evidence };

  for (let i = 0; i < maxAttempts; i++) {
    const prevResult = attempts.length > 0 ? attempts[attempts.length - 1].result : undefined;
    const diagnosis = DEFAULT_REPAIR_ACTIONS[0]?.diagnose(prevResult ?? { ok: false, exitCode: null, stdout: "", stderr: "", durationMs: 0, error: "initial" }) ?? "Repair attempt";

    const action = DEFAULT_REPAIR_ACTIONS[0]?.action() ?? ["npm", "run", "build"];
    const result = await execute({ command: action[0], args: action.slice(1), cwd, timeoutMs: 120_000 });

    attempts.push({
      attempt: i + 1,
      maxAttempts,
      diagnosis,
      action: action.join(" "),
      result,
    });

    if (result.ok) {
      currentEvidence = markBuild(currentEvidence, true, `Repair attempt ${i + 1} succeeded`, 0, result.durationMs);
      const { verified } = verifyMission(currentEvidence);
      if (verified) {
        return { evidence: currentEvidence, attempts, success: true };
      }
    } else {
      currentEvidence = markBuild(currentEvidence, false, `Repair attempt ${i + 1} failed: ${result.error}`, result.exitCode ?? -1, result.durationMs);
    }
  }

  return { evidence: currentEvidence, attempts, success: false };
}

export { DEFAULT_MAX_REPAIRS };
