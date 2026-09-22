/**
 * Tests for execution adapter.
 * Run: npx tsx src/lib/mission/__tests__/execution.test.ts
 */

import { execute, runBuild, runTest } from "../execution";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected)
    throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

async function testExecuteDisallowsDangerous() {
  const result = await execute({ command: "rm", args: ["-rf", "/"], cwd: "/tmp", timeoutMs: 1000 });
  assert(!result.ok, "dangerous command should be blocked");
  assert(result.error !== undefined && result.error.includes("not allowed"), "should mention not allowed");
}

async function testExecuteDisallowsBlockedPatterns() {
  const result = await execute({ command: "npm", args: ["run", "build", "&&", "rm", "-rf", "/"], cwd: "/tmp", timeoutMs: 1000 });
  assert(!result.ok, "blocked pattern should be rejected");
  assert(result.error !== undefined, "should have error");
}

async function testExecuteSafeCommand() {
  const result = await execute({ command: "node", args: ["-e", "console.log('hello')"], cwd: "/tmp", timeoutMs: 10000 });
  assert(result.ok, "safe command should succeed");
  assertEqual(result.exitCode, 0, "exit code 0");
  assert(result.stdout.includes("hello"), "stdout contains hello");
}

async function testRunBuild() {
  const result = await runBuild("/tmp", 5000);
  assertEqual(typeof result.ok, "boolean", "build returns boolean");
  assertEqual(typeof result.durationMs, "number", "build returns duration");
}

async function testRunTest() {
  const result = await runTest("/tmp", 5000);
  assertEqual(typeof result.ok, "boolean", "test returns boolean");
  assertEqual(typeof result.durationMs, "number", "test returns duration");
}

async function testExecuteTimeout() {
  const result = await execute({ command: "node", args: ["-e", "setTimeout(()=>{}, 60000)"], cwd: "/tmp", timeoutMs: 500 });
  assert(!result.ok, "timed out command should fail");
  assert(result.error?.includes("timed out") || result.exitCode === null, "should have timeout error");
}

async function main() {
  const tests = [
    { name: "executeDisallowsDangerous", fn: testExecuteDisallowsDangerous },
    { name: "executeDisallowsBlockedPatterns", fn: testExecuteDisallowsBlockedPatterns },
    { name: "executeSafeCommand", fn: testExecuteSafeCommand },
    { name: "runBuild", fn: testRunBuild },
    { name: "runTest", fn: testRunTest },
    { name: "executeTimeout", fn: testExecuteTimeout },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
      console.log(`  ✓ ${test.name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${test.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All execution tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
