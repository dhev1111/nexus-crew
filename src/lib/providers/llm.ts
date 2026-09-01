/**
 * LLM provider abstraction.
 * Prefer Free AI Router (AI_ROUTER_URL) when set — keys stay on the router.
 * Falls back to OpenAI-compatible direct providers when router is not configured.
 * Server-side only. Never import from client components.
 */

import {
  chatViaRouter,
  isRouterConfigured,
  messagesToRouterPrompt,
} from "@/lib/ai-router";

export type LLMProvider = "openai" | "xai" | "openrouter" | "custom" | "router";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
  /** Prefer cheaper/faster model when configured */
  preferFast?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  raw?: unknown;
}

function getConfig() {
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase() as LLMProvider;
  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.XAI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    "";

  let baseUrl = process.env.LLM_BASE_URL || "";
  let defaultModel = process.env.LLM_MODEL || "";
  let fastModel = process.env.LLM_FAST_MODEL || "";

  if (!baseUrl) {
    switch (provider) {
      case "xai":
        baseUrl = "https://api.x.ai/v1";
        defaultModel = defaultModel || "grok-2-latest";
        fastModel = fastModel || defaultModel;
        break;
      case "openrouter":
        baseUrl = "https://openrouter.ai/api/v1";
        defaultModel = defaultModel || "openai/gpt-4o-mini";
        fastModel = fastModel || "openai/gpt-4o-mini";
        break;
      case "custom":
        baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
        defaultModel = defaultModel || "gpt-4o-mini";
        fastModel = fastModel || defaultModel;
        break;
      case "router":
        baseUrl = "";
        defaultModel = defaultModel || "router";
        fastModel = fastModel || defaultModel;
        break;
      default:
        baseUrl = "https://api.openai.com/v1";
        defaultModel = defaultModel || "gpt-4o-mini";
        fastModel = fastModel || "gpt-4o-mini";
    }
  }

  return {
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    defaultModel,
    fastModel: fastModel || defaultModel,
  };
}

/**
 * Configured if AI Router URL is set OR a direct LLM API key is present.
 * Keys must never be sent to the browser.
 */
export function isLLMConfigured(): boolean {
  if (isRouterConfigured()) return true;
  const { apiKey } = getConfig();
  return Boolean(apiKey && apiKey.length > 8);
}

export async function chatCompletion(
  messages: LLMMessage[],
  options: LLMOptions = {}
): Promise<LLMResponse> {
  // Prefer local Free AI Router when AI_ROUTER_URL is set
  if (isRouterConfigured()) {
    const prompt = messagesToRouterPrompt(messages);
    const result = await chatViaRouter(prompt, {
      timeoutMs: options.timeoutMs ?? 90_000,
      maxRetries: 2,
    });
    return {
      content: result.answer,
      model: result.model,
      provider: result.provider,
      raw: result,
    };
  }

  const { apiKey, baseUrl, defaultModel, fastModel } = getConfig();

  if (!apiKey) {
    throw new Error(
      "No AI backend configured. Set AI_ROUTER_URL for the Free AI Router, or LLM_API_KEY for a direct provider."
    );
  }

  const model =
    options.model || (options.preferFast ? fastModel : defaultModel) || defaultModel;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 2048,
  };

  if (options.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.LLM_PROVIDER === "openrouter"
          ? {
              "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://nexus-crew.vercel.app",
              "X-Title": "Nexus Crew",
            }
          : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: LLMResponse["usage"];
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      throw new Error("LLM returned empty content");
    }

    return {
      content,
      model: data.model || model,
      provider: process.env.LLM_PROVIDER || "openai",
      usage: data.usage,
      raw: data,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry wrapper with exponential backoff */
export async function chatCompletionWithRetry(
  messages: LLMMessage[],
  options: LLMOptions = {},
  maxRetries = 2
): Promise<LLMResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(messages, options);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError!;
}
