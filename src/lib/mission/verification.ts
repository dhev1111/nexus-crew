import type { VerificationEvidence, VerificationStatus, BuildEvidence, TestEvidence, RuntimeEvidence, ProductFlowEvidence, ProductFlowCheck } from "./types";

export function createVerificationEvidence(): VerificationEvidence {
  return {};
}

export function markBuild(evidence: VerificationEvidence, passed: boolean, details?: string, exitCode?: number, durationMs?: number): VerificationEvidence {
  return { ...evidence, build: { passed, details, exitCode, durationMs } };
}

export function markTests(evidence: VerificationEvidence, passed: boolean, total?: number, failed?: number, details?: string, durationMs?: number): VerificationEvidence {
  return { ...evidence, tests: { passed, total, failed, details, durationMs } };
}

export function markRuntime(evidence: VerificationEvidence, started: boolean, healthy?: boolean, details?: string, exitCode?: number, durationMs?: number): VerificationEvidence {
  return { ...evidence, runtime: { started, healthy, details, exitCode, durationMs } };
}

export function markProductFlow(evidence: VerificationEvidence, checks: ProductFlowCheck[]): VerificationEvidence {
  const verified = checks.every((c) => c.passed);
  return { ...evidence, productFlow: { verified, checks } };
}

export function determineVerificationStatus(evidence: VerificationEvidence): VerificationStatus {
  if (!hasAnyVerification(evidence)) return "unverified";
  if (evidence.build && !evidence.build.passed) return "failing";
  if (evidence.tests && !evidence.tests.passed) return "failing";
  if (evidence.runtime && evidence.runtime.started && !evidence.runtime.healthy) return "failing";
  if (evidence.productFlow && !evidence.productFlow.verified) return "failing";
  const allPresentPass =
    (!evidence.build || evidence.build.passed) &&
    (!evidence.tests || evidence.tests.passed) &&
    (!evidence.runtime || !evidence.runtime.started || evidence.runtime.healthy) &&
    (!evidence.productFlow || evidence.productFlow.verified);
  const hasBuildAndTests = evidence.build !== undefined && evidence.tests !== undefined;
  if (allPresentPass && hasBuildAndTests) return "passing";
  return "unverified";
}

function hasAnyVerification(evidence: VerificationEvidence): boolean {
  return (
    evidence.build !== undefined ||
    evidence.tests !== undefined ||
    evidence.runtime !== undefined ||
    evidence.productFlow !== undefined
  );
}

export function verifyMission(evidence: VerificationEvidence): { verified: boolean; status: VerificationStatus } {
  const status = determineVerificationStatus(evidence);
  return { verified: status === "passing", status };
}
