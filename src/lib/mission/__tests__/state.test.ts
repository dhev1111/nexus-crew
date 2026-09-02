import { createMissionState, updateStep, addArtifact } from "../state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
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
