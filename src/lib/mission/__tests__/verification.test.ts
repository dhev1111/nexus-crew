/**
 * Tests for verification module.
 * Run: npx tsx src/lib/mission/__tests__/verification.test.ts
 */

import {
  createVerificationEvidence,
  markBuild,
  markTests,
  markRuntime,
  markProductFlow,
  determineVerificationStatus,
  verifyMission,
} from "../verification";
import { canCompleteMission, hasAnyVerification } from "../types";
import type { VerificationEvidence } from "../types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected)
    throw new Error(`ASSERTION FAILED: ${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}

// ---------- tests ----------

function testCreateVerificationEvidence() {
  const ev = createVerificationEvidence();
  assertEqual(Object.keys(ev).length, 0, "empty evidence");
}

function testMarkBuild() {
  const ev = markBuild(createVerificationEvidence(), true, "Build OK", 0, 5000);
  assert(ev.build !== undefined, "build set");
  assertEqual(ev.build!.passed, true, "build passed");
  assertEqual(ev.build!.details, "Build OK", "build details");
}

function testMarkBuildFail() {
  const ev = markBuild(createVerificationEvidence(), false, "Build error", 1, 1000);
  assert(ev.build !== undefined, "build set");
  assertEqual(ev.build!.passed, false, "build failed");
  assertEqual(ev.build!.exitCode, 1, "exit code");
}

function testMarkTests() {
  const ev = markTests(createVerificationEvidence(), true, 5, 0, "All tests passed", 3000);
  assert(ev.tests !== undefined, "tests set");
  assertEqual(ev.tests!.passed, true, "tests passed");
  assertEqual(ev.tests!.total, 5, "total");
  assertEqual(ev.tests!.failed, 0, "failed");
}

function testMarkRuntime() {
  const ev = markRuntime(createVerificationEvidence(), true, true, "Healthy", 0, 5000);
  assert(ev.runtime !== undefined, "runtime set");
  assertEqual(ev.runtime!.started, true, "started");
  assertEqual(ev.runtime!.healthy, true, "healthy");
}

function testMarkProductFlow() {
  const ev = markProductFlow(createVerificationEvidence(), [
    { name: "load", passed: true },
    { name: "create", passed: true },
  ]);
  assert(ev.productFlow !== undefined, "productFlow set");
  assertEqual(ev.productFlow!.verified, true, "verified");
  assertEqual(ev.productFlow!.checks.length, 2, "checks count");
}

function testDetermineVerificationStatus() {
  const ev1 = createVerificationEvidence();
  assertEqual(determineVerificationStatus(ev1), "unverified", "empty = unverified");

  const ev2 = markBuild(createVerificationEvidence(), true);
  assertEqual(determineVerificationStatus(ev2), "unverified", "build only = unverified");

  const ev3 = markBuild(markTests(createVerificationEvidence(), true), true);
  assertEqual(determineVerificationStatus(ev3), "passing", "build+tests passing");

  const ev4 = markBuild(createVerificationEvidence(), false);
  assertEqual(determineVerificationStatus(ev4), "failing", "build failing");
}

function testVerifyMission() {
  const ev = markBuild(markTests(createVerificationEvidence(), true), true);
  const result = verifyMission(ev);
  assertEqual(result.verified, true, "verified");
  assertEqual(result.status, "passing", "status passing");
}

function testCanCompleteMission() {
  assert(canCompleteMission(markBuild(markTests(createVerificationEvidence(), true), true)), "can complete");
  assert(!canCompleteMission(markBuild(createVerificationEvidence(), false)), "cannot complete when build fails");
}

function testHasAnyVerification() {
  assert(!hasAnyVerification(createVerificationEvidence()), "empty has no verification");
  assert(hasAnyVerification(markBuild(createVerificationEvidence(), true)), "build evidence exists");
}

function testProductFlowFail() {
  const ev = markProductFlow(createVerificationEvidence(), [
    { name: "load", passed: true },
    { name: "create", passed: false },
  ]);
  assertEqual(determineVerificationStatus(ev), "failing", "product flow failing");
}

// ---------- run ----------

const tests = [
  { name: "createVerificationEvidence", fn: testCreateVerificationEvidence },
  { name: "markBuild", fn: testMarkBuild },
  { name: "markBuildFail", fn: testMarkBuildFail },
  { name: "markTests", fn: testMarkTests },
  { name: "markRuntime", fn: testMarkRuntime },
  { name: "markProductFlow", fn: testMarkProductFlow },
  { name: "determineVerificationStatus", fn: testDetermineVerificationStatus },
  { name: "verifyMission", fn: testVerifyMission },
  { name: "canCompleteMission", fn: testCanCompleteMission },
  { name: "hasAnyVerification", fn: testHasAnyVerification },
  { name: "productFlowFail", fn: testProductFlowFail },
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
console.log("All verification tests passed.");
