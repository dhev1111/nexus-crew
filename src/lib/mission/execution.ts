import { execFile } from "child_process";
import type { ExecutionRequest, ExecutionResult } from "./types";

const DEFAULT_TIMEOUT = 120_000;
const ALLOWED_COMMANDS = ["npm", "npx", "node", "pnpm", "yarn"];
const BLOCKED_PATTERNS = [
  /rm\s+-rf/i,
  /mkfs/i,
  /dd\s+if/i,
  /curl.*\$\{/i,
  /wget.*\$\{/i,
];

function isCommandAllowed(command: string): boolean {
  const base = command.split(/[\s|&;]/)[0].trim();
  return ALLOWED_COMMANDS.includes(base);
}

function isSafeCommand(command: string, args: string[]): boolean {
  const combined = [command, ...args].join(" ");
  return !BLOCKED_PATTERNS.some((p) => p.test(combined));
}

function sanitizeEnv(env?: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  if (!env) return safe;
  const allowedKeys = ["PATH", "NODE_ENV", "HOME", "PWD", "npm_config_prefix", "npm_config_cache"];
  for (const [k, v] of Object.entries(env)) {
    if (allowedKeys.includes(k)) {
      safe[k] = v;
    }
  }
  return safe;
}

export async function execute(req: ExecutionRequest): Promise<ExecutionResult> {
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT;
  const command = req.command;
  const args = req.args ?? [];

  if (!isCommandAllowed(command)) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: `Command not allowed: ${command}`,
      durationMs: 0,
      error: `Command not allowed`,
    };
  }

  if (!isSafeCommand(command, args)) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: `Command contains blocked patterns`,
      durationMs: 0,
      error: `Command contains blocked patterns`,
    };
  }

  const start = Date.now();
  try {
    return await new Promise((resolve, reject) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      execFile(
        command,
        args,
        {
          cwd: req.cwd,
          timeout: timeoutMs,
          env: { ...sanitizeEnv(req.env), ...process.env },
          maxBuffer: 1024 * 1024 * 10,
        },
        (err, stdout, stderr) => {
          clearTimeout(timer);
          if (err) {
            resolve({
              ok: false,
              exitCode: (err as { code?: number }).code ?? null,
              stdout: stdout ?? "",
              stderr: stderr ?? err.message,
              durationMs: Date.now() - start,
              error: err.message,
            });
          } else {
            resolve({
              ok: true,
              exitCode: 0,
              stdout: stdout ?? "",
              stderr: stderr ?? "",
              durationMs: Date.now() - start,
            });
          }
        }
      );
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: msg,
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}

export async function runBuild(cwd: string, timeoutMs = 120_000): Promise<ExecutionResult> {
  return execute({ command: "npm", args: ["run", "build"], cwd, timeoutMs });
}

export async function runTest(cwd: string, timeoutMs = 120_000): Promise<ExecutionResult> {
  return execute({ command: "npm", args: ["run", "test"], cwd, timeoutMs });
}

export async function runDev(cwd: string, timeoutMs = 30_000): Promise<ExecutionResult> {
  return execute({ command: "npm", args: ["run", "dev"], cwd, timeoutMs });
}
