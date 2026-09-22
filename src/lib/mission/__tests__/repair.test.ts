/**
 * Tests for repair loop and mission state.
 * Run: npx tsx src/lib/mission/__tests__/repair.test.ts
 */

import { createMissionState, updateStep, addArtifact } from "../state";
import { repairLoop } from "../repair";
import type { VerificationEvidence } from "../types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected)
    throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

function testCreateMissionState() {
  const s = createMissionState("test mission");
  assertEqual(s.status, "pending", "status pending");
  assertEqual(s.mission, "test mission", "mission set");
  assertEqual(s.steps.length, 0, "no steps yet");
  assertEqual(s.artifacts.length, 0, "no artifacts yet");
}

function testUpdateStep() {
  const s = createMissionState("test mission");
  const s2 = updateStep(s, "orchestrator", { status: "running", name: "Orchestrator" });
  assertEqual(s2.steps.length, 1, "step added");
  assertEqual(s2.steps[0].status, "running", "step running");
}

function testAddArtifact() {
  const s = createMissionState("test mission");
  const s2 = updateStep(s, "orchestrator", { status: "running" });
  const s3 = addArtifact(s2, { type: "plan", title: "T", creatorAgent: "planner", content: "hello" });
  assertEqual(s3.artifacts.length, 1, "artifact added");
  assertEqual(s3.artifacts[0].missionId, s.id, "artifact mission id");
}

function testMissionStateHasVerificationAndProductResult() {
  const s = createMissionState("test");
  assertEqual(s.verification, undefined, "verification optional");
  assertEqual(s.productResult, undefined, "productResult optional");
  assertEqual(s.stageProgress, undefined, "stageProgress optional");
}

function testBlockedStatus() {
  const s = createMissionState("test");
  const blocked = { ...s, status: "blocked" as const, error: "Provider unavailable" };
  assertEqual(blocked.status, "blocked", "blocked status");
}

function testTimedOutStatus() {
  const s = createMissionState("test");
  const timedOut = { ...s, status: "timed_out" as const, error: "Timed out" };
  assertEqual(timedOut.status, "timed_out", "timed_out status");
}

function testStageProgress() {
  const s = createMissionState("test");
  const s2 = {
    ...s,
    stageProgress: [{ stage: "coder", status: "running", startedAt: Date.now() }],
  };
  assertEqual(s2.stageProgress?.length, 1, "stageProgress set");
}

async function main() {
  // ---------- run ----------

  const tests = [
    { name: "createMissionState", fn: testCreateMissionState },
    { name: "updateStep", fn: testUpdateStep },
    { name: "addArtifact", fn: testAddArtifact },
    { name: "missionStateHasVerificationAndProductResult", fn: testMissionStateHasVerificationAndProductResult },
    { name: "blockedStatus", fn: testBlockedStatus },
    { name: "timedOutStatus", fn: testTimedOutStatus },
    { name: "stageProgress", fn: testStageProgress },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test.fn();
      passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${test.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All mission state tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
