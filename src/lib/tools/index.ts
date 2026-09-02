/**
 * Secure tool framework — permission-gated, sandboxed.
 */

export type ToolName =
  | "web_search"
  | "url_read"
  | "file_read"
  | "file_write"
  | "file_list"
  | "code_gen";

export interface ToolResult {
  ok: boolean;
  tool: ToolName;
  output: string;
  error?: string;
  meta?: Record<string, unknown>;
}

const ALLOW_WEB = process.env.TOOL_ALLOW_WEB === "true";
const ALLOW_FILE_WRITE = process.env.TOOL_ALLOW_FILE_WRITE === "true";
const ALLOW_URL_READ = process.env.TOOL_ALLOW_URL_READ === "true";

const missionFiles = new Map<string, string>();
const BLOCKED_PATHS = [".env", "credentials", "secret", "node_modules", ".."];

function isSafePath(p: string): boolean {
  const lower = p.toLowerCase();
  if (!p || p.startsWith("/") || p.includes("..")) return false;
  return !BLOCKED_PATHS.some((b) => lower.includes(b));
}

export function clearMissionFiles() {
  missionFiles.clear();
}

export async function runTool(tool: ToolName, input: string): Promise<ToolResult> {
  const start = Date.now();
  try {
    switch (tool) {
      case "web_search": {
        if (!ALLOW_WEB) {
          return {
            ok: false,
            tool,
            output: "",
            error:
              "Web search disabled. Set TOOL_ALLOW_WEB=true and configure SEARCH_API_KEY.",
          };
        }
        const provider = (process.env.SEARCH_PROVIDER || "stub").toLowerCase();
        if (provider === "stub" || !process.env.SEARCH_API_KEY) {
          return {
            ok: true,
            tool,
            output: JSON.stringify([
              {
                title: "Stub result",
                url: "https://example.com",
                snippet: `Configure SEARCH_PROVIDER and SEARCH_API_KEY. Query: ${input.slice(0, 100)}`,
              },
            ]),
            meta: { provider: "stub", durationMs: Date.now() - start },
          };
        }
        return {
          ok: true,
          tool,
          output: JSON.stringify([]),
          meta: { provider, durationMs: Date.now() - start },
        };
      }

      case "url_read": {
        if (!ALLOW_URL_READ) {
          return {
            ok: false,
            tool,
            output: "",
            error: "URL read disabled. Set TOOL_ALLOW_URL_READ=true",
          };
        }
        try {
          const url = input.trim();
          if (!/^https?:\/\//i.test(url)) {
            return { ok: false, tool, output: "", error: "Only http(s) URLs allowed" };
          }
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 12_000);
          const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "NexusCrew/1.0" },
          });
          clearTimeout(t);
          const text = (await res.text()).slice(0, 20_000);
          return {
            ok: res.ok,
            tool,
            output: text,
            error: res.ok ? undefined : `HTTP ${res.status}`,
            meta: { durationMs: Date.now() - start },
          };
        } catch (err) {
          return {
            ok: false,
            tool,
            output: "",
            error: err instanceof Error ? err.message : "fetch failed",
          };
        }
      }

      case "file_list":
        return {
          ok: true,
          tool,
          output: JSON.stringify(Array.from(missionFiles.keys())),
        };

      case "file_read": {
        if (!isSafePath(input)) {
          return { ok: false, tool, output: "", error: "Unsafe path" };
        }
        const content = missionFiles.get(input);
        if (content === undefined) {
          return { ok: false, tool, output: "", error: `File not found: ${input}` };
        }
        return { ok: true, tool, output: content };
      }

      case "file_write": {
        if (!ALLOW_FILE_WRITE) {
          return {
            ok: false,
            tool,
            output: "",
            error: "File write disabled. Set TOOL_ALLOW_FILE_WRITE=true",
          };
        }
        const sep = input.indexOf("\n\n");
        const path = (sep === -1 ? input.slice(0, 64) : input.slice(0, sep)).trim();
        const content = sep === -1 ? "" : input.slice(sep + 2);
        if (!isSafePath(path)) {
          return { ok: false, tool, output: "", error: "Unsafe path" };
        }
        if (content.length > 200_000) {
          return { ok: false, tool, output: "", error: "File too large" };
        }
        missionFiles.set(path, content);
        return {
          ok: true,
          tool,
          output: `Wrote ${content.length} chars to ${path}`,
          meta: { durationMs: Date.now() - start },
        };
      }

      case "code_gen":
        return {
          ok: true,
          tool,
          output: `Code generation noted: ${input.slice(0, 120)}`,
        };

      default:
        return { ok: false, tool, output: "", error: `Unknown tool: ${tool}` };
    }
  } catch (err) {
    return {
      ok: false,
      tool,
      output: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function listMissionFiles(): string[] {
  return Array.from(missionFiles.keys());
}
