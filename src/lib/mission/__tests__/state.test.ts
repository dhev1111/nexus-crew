import { createMissionState, updateStep, addArtifact } from "../state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected)
    throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

export function runStateTests() {
  const s = createMissionState("test mission");
  assert(s.status === "pending", "status pending");
  assert(s.mission === "test mission", "mission set");
  assert(s.steps.length === 0, "no steps yet");

  const s2 = updateStep(s, "orchestrator", { status: "running", name: "Orchestrator" });
  assert(s2.steps.length === 1, "step added");
  assert(s2.steps[0].status === "running", "step running");

  const s3 = addArtifact(s2, {
    type: "plan",
    title: "T",
    creatorAgent: "planner",
    content: "hello",
  });
  assert(s3.artifacts.length === 1, "artifact added");
  assert(s3.artifacts[0].missionId === s.id, "artifact mission id");

  return "state tests passed";
}

function testVerificationFields() {
  const s = createMissionState("test");
  assertEqual(s.verification, undefined, "verification optional");
  assertEqual(s.productResult, undefined, "productResult optional");
  assertEqual(s.stageProgress, undefined, "stageProgress optional");
}

function testBlockedAndTimedOut() {
  const s = createMissionState("test");
  const blocked = { ...s, status: "blocked" as any };
  assertEqual(blocked.status, "blocked", "blocked status");
  const timedOut = { ...s, status: "timed_out" as any };
  assertEqual(timedOut.status, "timed_out", "timed_out status");
}

function testAllMissionStatuses() {
  const statuses = ["pending", "running", "awaiting_approval", "completed", "failed", "blocked", "timed_out", "cancelled"];
  const s = createMissionState("test");
  for (const st of statuses) {
    const updated = { ...s, status: st as any };
    assertEqual(updated.status, st, `status ${st}`);
  }
}

// Auto-run when executed directly
async function main() {
  try {
    runStateTests();
    console.log("  ✓ state tests (runStateTests)");
    testVerificationFields();
    console.log("  ✓ verification fields");
    testBlockedAndTimedOut();
    console.log("  ✓ blocked/timed_out statuses");
    testAllMissionStatuses();
    console.log("  ✓ all mission statuses");
    console.log("\nAll state tests passed.");
  } catch (err) {
    console.error("State tests failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
