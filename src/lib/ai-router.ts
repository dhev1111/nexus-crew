/**
 * Server-side client for the Secure AI Gateway (Cloudflare Worker or local router).
 * Never import from client components — token must not reach the browser.
 *
 * External gateway (when AI_ROUTER_URL is set):
 *   POST {AI_ROUTER_URL}/api/chat
 *   Authorization: Bearer ${AI_ROUTER_TOKEN}
 *   body: { message: string } | { messages: [{role, content}] }
 *   response: { success, provider, model, answer }
 *   GET  {AI_ROUTER_URL}/health
 *
 * Internal gateway (when AI_ROUTER_URL is NOT set):
 *   Calls the internal providers module directly with provider fallback.
 */

import { chatWithFallback, hasAnyProviderKey } from "@/lib/ai-gateway/providers";

export interface RouterChatResult {
  answer: string;
  provider: string;
  model: string;
  success: boolean;
}

export interface RouterHealth {
  online: boolean;
  url: string;
  latencyMs?: number;
  detail?: string;
}

function routerBaseUrl(): string {
  return (process.env.AI_ROUTER_URL || "").trim().replace(/\/$/, "");
}

/** Prefer AI_ROUTER_TOKEN; AI_ROUTER_SECRET kept as alias for local Termux routers. */
function routerToken(): string {
  return (
    process.env.AI_ROUTER_TOKEN ||
    process.env.AI_ROUTER_SECRET ||
    ""
  ).trim();
}

export function isRouterConfigured(): boolean {
  return routerBaseUrl().length > 0;
}

export function isInternalGatewayAvailable(): boolean {
  return hasAnyProviderKey();
}

function authHeaders(): Record<string, string> {
  const token = routerToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function checkRouterHealth(timeoutMs = 5000): Promise<RouterHealth> {
  const url = routerBaseUrl();
  if (!url) {
    return { online: false, url: "", detail: "AI_ROUTER_URL not set (internal gateway available)" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const res = await fetch(`${url}/health`, {
      method: "GET",
      headers: { ...authHeaders() },
      signal: controller.signal,
      cache: "no-store",
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { online: false, url, latencyMs, detail: `health HTTP ${res.status}` };
    }
    return { online: true, url, latencyMs, detail: "ok" };
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timeout after ${timeoutMs}ms`
          : err.message
        : String(err);
    return { online: false, url, detail: msg };
  } finally {
    clearTimeout(timer);
  }
}

export async function chatViaRouter(
  message: string,
  options?: { timeoutMs?: number; maxRetries?: number; messages?: Array<{ role: string; content: string }> }
): Promise<RouterChatResult> {
  const url = routerBaseUrl();
  const timeoutMs = options?.timeoutMs ?? 90_000;

  if (url) {
    return chatViaExternalRouter(url, message, options, timeoutMs);
  }

  return chatViaInternalGateway(message, timeoutMs);
}

async function chatViaInternalGateway(
  message: string,
  timeoutMs: number
): Promise<RouterChatResult> {
  console.log("[AI ROUTER] Using internal gateway (provider fallback chain)");

  const result = await chatWithFallback(message, timeoutMs);

  if (result.success) {
    console.log("[AI ROUTER] Provider:", result.provider);
    console.log("[AI ROUTER] Model:", result.model);
    console.log("[AI ROUTER] Success");
  }

  return result;
}

async function chatViaExternalRouter(
  url: string,
  message: string,
  options: { timeoutMs?: number; maxRetries?: number; messages?: Array<{ role: string; content: string }> } | undefined,
  timeoutMs: number
): Promise<RouterChatResult> {
  const token = routerToken();
  if (!token) {
    throw new Error(
      "AI Gateway token missing. Set AI_ROUTER_TOKEN in server environment (never NEXT_PUBLIC_)."
    );
  }

  const maxRetries = options?.maxRetries ?? 2;
  let lastError: Error | null = null;

  console.log("[AI ROUTER] Request", { url: `${url}/api/chat`, chars: message.length });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body =
        options?.messages && options.messages.length > 0
          ? { messages: options.messages }
          : { message };

      const res = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await res.text();
      let data: {
        success?: boolean;
        provider?: string;
        model?: string;
        answer?: string;
        error?: string;
      } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        throw new Error(
          `AI Gateway returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
        );
      }

      if (res.status === 401) {
        throw new Error("AI Gateway unauthorized — check AI_ROUTER_TOKEN");
      }
      if (res.status === 429) {
        throw new Error("AI Gateway rate limit exceeded");
      }
      if (!res.ok || data.success === false) {
        throw new Error(data.error || `AI Gateway error HTTP ${res.status}`);
      }

      const answer = (data.answer || "").trim();
      if (!answer) throw new Error("AI Gateway returned empty answer");

      const provider = data.provider || "unknown";
      const model = data.model || "unknown";
      console.log("[AI ROUTER] Provider:", provider);
      console.log("[AI ROUTER] Model:", model);
      console.log("[AI ROUTER] Success");

      return { success: true, answer, provider, model };
    } catch (err) {
      lastError =
        err instanceof Error
          ? err.name === "AbortError"
            ? new Error(`AI Gateway timed out after ${timeoutMs}ms`)
            : err
          : new Error(String(err));
      console.error(
        `[AI ROUTER] Attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        lastError.message
      );
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError!;
}

export function messagesToRouterPrompt(
  messages: Array<{ role: string; content: string }>
): string {
  return messages.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n");
}
