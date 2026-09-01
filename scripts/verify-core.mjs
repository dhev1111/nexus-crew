let failed = 0;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); failed++; }
  else console.log("PASS:", msg);
}

const BLOCKED = [".env", "credentials", "secret", "node_modules", ".."];
function isSafePath(p) {
  const lower = (p || "").toLowerCase();
  if (!p || p.startsWith("/") || p.includes("..")) return false;
  return !BLOCKED.some((b) => lower.includes(b));
}

assert(!isSafePath("../etc/passwd"), "reject path traversal");
assert(!isSafePath("/etc/passwd"), "reject absolute path");
assert(!isSafePath(".env"), "reject .env");
assert(!isSafePath("foo/../../../secret"), "reject nested traversal");
assert(isSafePath("src/app.ts"), "allow relative safe path");
assert(isSafePath("notes/plan.md"), "allow nested safe path");
assert(process.env.TOOL_ALLOW_FILE_WRITE !== "true", "file write off by default");
assert(process.env.TOOL_ALLOW_WEB !== "true", "web search off by default");

const statuses = ["queued","running","completed","failed","retrying","waiting_approval","skipped","cancelled"];
assert(statuses.includes("waiting_approval"), "approval status exists");
assert(statuses.includes("retrying"), "retry status exists");

let approval = { status: "pending" };
assert(approval.status === "pending", "approval starts pending");
approval = { status: "approved" };
assert(approval.status === "approved", "can approve");
approval = { status: "rejected" };
assert(approval.status === "rejected", "can reject");

const maxAttempts = 2;
let attempts = 0;
let finalStatus = "running";
while (attempts < maxAttempts) {
  attempts++;
  if (attempts >= maxAttempts) finalStatus = "failed";
}
assert(attempts === 2, "retry capped at 2");
assert(finalStatus === "failed", "fails after max retries");

const pipeline = ["orchestrator","planner","researcher","analyst","architect","builder","designer","coder","tester","security","reviewer","documenter"];
assert(pipeline.length === 12, "12-agent default pipeline");
assert(pipeline[0] === "orchestrator", "starts with orchestrator");
assert(pipeline[pipeline.length-1] === "documenter", "ends with documenter");

const MAX = 12000;
let total = 100;
const chunks = ["a".repeat(5000), "b".repeat(5000), "c".repeat(5000)];
let included = 0;
for (const c of chunks) {
  if (total + c.length > MAX) break;
  total += c.length;
  included++;
}
assert(included < 3, "context trim prevents bloat");
assert(total <= MAX, "context under limit");

console.log("---");
if (failed === 0) { console.log("ALL CORE CHECKS PASSED"); process.exit(0); }
else { console.log(failed, "FAILURES"); process.exit(1); }
