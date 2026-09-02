import { runTool, clearMissionFiles } from "../../tools";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

export async function runToolTests() {
  clearMissionFiles();

  const blocked = await runTool("file_write", ".env\n\nsecret");
  // write may be disabled entirely
  assert(!blocked.ok, "should not write .env or when disabled");

  const badPath = await runTool("file_read", "../etc/passwd");
  assert(!badPath.ok, "path traversal blocked");

  const web = await runTool("web_search", "test");
  // either disabled or stub
  assert(typeof web.ok === "boolean", "web_search returns result");

  return "tool tests passed";
}
