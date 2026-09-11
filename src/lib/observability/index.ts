/**
 * Structured observability event system.
 * Never logs secrets, API keys, tokens, or sensitive user data.
 */

export type EventCategory =
  | "execution"
  | "agent"
  | "memory"
  | "research"
  | "content"
  | "video"
  | "social"
  | "analytics"
  | "funnel"
  | "gateway"
  | "recovery"
  | "system";

export type EventLevel = "info" | "warn" | "error" | "debug";

export interface NexusEvent {
  id: string;
  ts: number;
  category: EventCategory;
  level: EventLevel;
  type: string;
  message: string;
  executionId?: string;
  agentId?: string;
  meta?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const events: NexusEvent[] = [];

function genId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const SECRET_KEYS = [
    "key", "token", "secret", "password", "authorization",
    "cookie", "api_key", "apiKey", "api-key", "credential",
  ];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function emitEvent(
  category: EventCategory,
  level: EventLevel,
  type: string,
  message: string,
  opts?: { executionId?: string; agentId?: string; meta?: Record<string, unknown> }
): NexusEvent {
  const event: NexusEvent = {
    id: genId(),
    ts: Date.now(),
    category,
    level,
    type,
    message,
    executionId: opts?.executionId,
    agentId: opts?.agentId,
    meta: opts?.meta ? redact(opts.meta) : undefined,
  };

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  const prefix = `[${category.toUpperCase()}] ${type}`;
  const logLine = `${prefix}: ${message}${opts?.executionId ? ` (${opts.executionId})` : ""}`;

  switch (level) {
    case "error":
      console.error(logLine);
      break;
    case "warn":
      console.warn(logLine);
      break;
    case "debug":
      console.debug(logLine);
      break;
    default:
      console.log(logLine);
  }

  return event;
}

export function getEvents(opts?: {
  category?: EventCategory;
  executionId?: string;
  limit?: number;
}): NexusEvent[] {
  let result = events;
  if (opts?.category) {
    result = result.filter((e) => e.category === opts.category);
  }
  if (opts?.executionId) {
    result = result.filter((e) => e.executionId === opts.executionId);
  }
  if (opts?.limit) {
    result = result.slice(-opts.limit);
  }
  return result;
}

export function clearEvents(): void {
  events.length = 0;
}

// Convenience emitters

export function emitExecution(type: string, message: string, executionId: string, meta?: Record<string, unknown>) {
  return emitEvent("execution", "info", type, message, { executionId, meta });
}

export function emitAgent(type: string, message: string, executionId: string, agentId: string, meta?: Record<string, unknown>) {
  return emitEvent("agent", "info", type, message, { executionId, agentId, meta });
}

export function emitAgentError(type: string, message: string, executionId: string, agentId: string, meta?: Record<string, unknown>) {
  return emitEvent("agent", "error", type, message, { executionId, agentId, meta });
}

export function emitRecovery(type: string, message: string, executionId: string, meta?: Record<string, unknown>) {
  return emitEvent("recovery", "info", type, message, { executionId, meta });
}

export function emitMemory(type: string, message: string, meta?: Record<string, unknown>) {
  return emitEvent("memory", "info", type, message, { meta });
}

export function emitSystem(type: string, message: string, meta?: Record<string, unknown>) {
  return emitEvent("system", "info", type, message, { meta });
}
