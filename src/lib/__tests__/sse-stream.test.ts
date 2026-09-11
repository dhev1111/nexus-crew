/**
 * Regression tests for SSE stream handling.
 * Tests the critical path: terminal event detection, stream-close recovery,
 * and error handling for the mission SSE stream.
 *
 * Run: npx tsx src/lib/__tests__/sse-stream.test.ts
 */

import { MissionState, AgentStatus } from "../mission/state";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected)
    throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

// Minimal MissionState factory for tests
function makeState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    id: "test_1",
    mission: "test mission",
    status: "running",
    steps: [],
    artifacts: [],
    approvals: [],
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// Simulate SSE parsing logic extracted from page.tsx launchMission
function simulateSSEParsing(events: string[]) {
  const decoder = new TextDecoder();
  let buffer = "";
  let terminalEventReceived = false;
  let lastState: MissionState | null = null;
  let lastError: string | null = null;

  for (const rawEvent of events) {
    buffer += rawEvent;
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "step") {
          lastState = parsed as MissionState;
        } else if (event === "done") {
          terminalEventReceived = true;
          lastState = parsed as MissionState;
        } else if (event === "error") {
          terminalEventReceived = true;
          lastError = (parsed as { error?: string }).error || "Stream error";
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  return { terminalEventReceived, lastState, lastError, buffer };
}

// Simulate stream-close recovery logic from page.tsx
function simulateStreamCloseRecovery(
  initialState: MissionState | null,
  terminalEventReceived: boolean
): { state: MissionState | null; error: string | null } {
  if (!terminalEventReceived && initialState && initialState.status === "running") {
    return {
      state: {
        ...initialState,
        status: "failed" as const,
        error: "Mission stream ended before completion. The server may have timed out. Please retry.",
        updatedAt: Date.now(),
      },
      error: "Mission stream ended before completion. The server may have timed out. Please retry.",
    };
  }
  return { state: initialState, error: null };
}

// Simulate reader.read() error handling
function simulateReaderError(
  initialState: MissionState | null,
  readError: boolean
): { state: MissionState | null; error: string | null } {
  if (readError && initialState && initialState.status === "running") {
    const msg = "Stream read error: connection reset";
    return {
      state: {
        ...initialState,
        status: "failed" as const,
        error: msg,
        updatedAt: Date.now(),
      },
      error: msg,
    };
  }
  return { state: initialState, error: null };
}

// ========== TESTS ==========

function testCompletedStream() {
  const stepEvent = `event: step\ndata: ${JSON.stringify(makeState({ status: "running" }))}\n\n`;
  const doneEvent = `event: done\ndata: ${JSON.stringify(makeState({ status: "completed", finalResult: "Done!" }))}\n\n`;
  const { terminalEventReceived, lastState } = simulateSSEParsing([stepEvent, doneEvent]);
  assertEqual(terminalEventReceived, true, "terminal event received after done");
  assertEqual(lastState?.status, "completed", "final status is completed");
  assertEqual(lastState?.finalResult, "Done!", "finalResult preserved");
}

function testStreamClosesBeforeTerminal() {
  const stepEvent = `event: step\ndata: ${JSON.stringify(makeState({ status: "running" }))}\n\n`;
  const { terminalEventReceived, lastState } = simulateSSEParsing([stepEvent]);
  assertEqual(terminalEventReceived, false, "no terminal event received");

  const { state, error } = simulateStreamCloseRecovery(lastState, terminalEventReceived);
  assertEqual(state?.status, "failed", "stuck running converted to failed");
  assert(error !== null, "error message set for stream close");
  assert(error!.includes("timed out"), "error mentions timeout");
}

function testReaderThrowsError() {
  const initialState = makeState({ status: "running" });
  const { state, error } = simulateReaderError(initialState, true);
  assertEqual(state?.status, "failed", "running converted to failed on reader error");
  assert(error !== null, "error message set for reader error");
  assert(error!.includes("Stream read"), "error mentions read failure");
}

function testFailedEventReceived() {
  const failedEvent = `event: done\ndata: ${JSON.stringify(makeState({ status: "failed", error: "Pipeline crashed" }))}\n\n`;
  const { terminalEventReceived, lastState, lastError } = simulateSSEParsing([failedEvent]);
  assertEqual(terminalEventReceived, true, "terminal event received for failed");
  assertEqual(lastState?.status, "failed", "final status is failed");
  assertEqual(lastState?.error, "Pipeline crashed", "error message preserved");
}

function testTimeoutFromServer() {
  const timeoutEvent = `event: done\ndata: ${JSON.stringify({
    id: "mission_timeout_123",
    mission: "test",
    status: "failed",
    error: "Mission timed out. The server execution budget was exceeded.",
    steps: [],
    artifacts: [],
    approvals: [],
    logs: [{ ts: Date.now(), level: "error", message: "Server execution budget exceeded" }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })}\n\n`;
  const { terminalEventReceived, lastState } = simulateSSEParsing([timeoutEvent]);
  assertEqual(terminalEventReceived, true, "terminal event received for timeout");
  assertEqual(lastState?.status, "failed", "timeout rendered as failed");
  assert(lastState!.error!.includes("timed out"), "timeout error message present");
}

function testUnexpectedStreamClosureNoSteps() {
  const { terminalEventReceived } = simulateSSEParsing([]);
  assertEqual(terminalEventReceived, false, "no terminal events in empty stream");

  const { state, error } = simulateStreamCloseRecovery(null, terminalEventReceived);
  assertEqual(state, null, "no state when stream was empty");
  assertEqual(error, null, "no error when there was no state");
}

// ========== RUN ==========

const tests = [
  { name: "Completed stream", fn: testCompletedStream },
  { name: "Stream closes before terminal", fn: testStreamClosesBeforeTerminal },
  { name: "Reader throws error", fn: testReaderThrowsError },
  { name: "Failed event received", fn: testFailedEventReceived },
  { name: "Timeout event from server", fn: testTimeoutFromServer },
  { name: "Unexpected stream closure (no steps)", fn: testUnexpectedStreamClosureNoSteps },
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
console.log("All SSE regression tests passed.");
