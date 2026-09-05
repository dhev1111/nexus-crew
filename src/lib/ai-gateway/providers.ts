/**
 * Server-side AI provider abstraction with fallback chain.
 * Provider fallback order: Gemini → Groq → NVIDIA → OpenRouter
 *
 * Reads API keys ONLY from server environment variables.
 * Never import from client components.
 */

export interface ProviderResult {
  success: boolean;
  provider: string;
  model: string;
  answer: string;
}

interface ProviderAttempt {
  name: string;
  model: string;
  call: (prompt: string, signal: AbortSignal) => Promise<ProviderResult>;
}

function envKey(name: string): string {
  return (process.env[name] || "").trim();
}

function geminiCall(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
  const key = envKey("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const model = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
    signal,
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!answer) throw new Error("Gemini returned empty response");
      return { success: true, provider: "gemini", model, answer };
    });
}

function groqCall(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
  const key = envKey("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not set");

  const model = "llama-3.3-70b-versatile";

  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2048,
    }),
    signal,
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`Groq ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const answer = data.choices?.[0]?.message?.content || "";
      if (!answer) throw new Error("Groq returned empty response");
      return { success: true, provider: "groq", model: data.model || model, answer };
    });
}

function nvidiaCall(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
  const key = envKey("NVIDIA_API_KEY");
  if (!key) throw new Error("NVIDIA_API_KEY not set");

  const model = "meta/llama-3.3-70b-instruct";

  return fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2048,
    }),
    signal,
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`NVIDIA ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const answer = data.choices?.[0]?.message?.content || "";
      if (!answer) throw new Error("NVIDIA returned empty response");
      return { success: true, provider: "nvidia", model: data.model || model, answer };
    });
}

function openrouterCall(prompt: string, signal: AbortSignal): Promise<ProviderResult> {
  const key = envKey("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const model = "openai/gpt-4o-mini";

  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://nexus-crew-v2.vercel.app",
      "X-Title": "Nexus Crew",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 2048,
    }),
    signal,
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const answer = data.choices?.[0]?.message?.content || "";
      if (!answer) throw new Error("OpenRouter returned empty response");
      return { success: true, provider: "openrouter", model: data.model || model, answer };
    });
}

const PROVIDER_CHAIN: ProviderAttempt[] = [
  { name: "gemini", model: "gemini-2.0-flash", call: geminiCall },
  { name: "groq", model: "llama-3.3-70b-versatile", call: groqCall },
  { name: "nvidia", model: "meta/llama-3.3-70b-instruct", call: nvidiaCall },
  { name: "openrouter", model: "openai/gpt-4o-mini", call: openrouterCall },
];

export function hasAnyProviderKey(): boolean {
  return PROVIDER_CHAIN.some((p) => {
    switch (p.name) {
      case "gemini": return Boolean(envKey("GEMINI_API_KEY"));
      case "groq": return Boolean(envKey("GROQ_API_KEY"));
      case "nvidia": return Boolean(envKey("NVIDIA_API_KEY"));
      case "openrouter": return Boolean(envKey("OPENROUTER_API_KEY"));
      default: return false;
    }
  });
}

/**
 * Attempt providers in fallback order. Returns first successful result.
 */
export async function chatWithFallback(
  prompt: string,
  timeoutMs = 90_000
): Promise<ProviderResult> {
  const errors: string[] = [];

  for (const provider of PROVIDER_CHAIN) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = await provider.call(prompt, controller.signal);
        clearTimeout(timer);
        return result;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AI GATEWAY] ${provider.name} failed: ${msg}`);
      errors.push(`${provider.name}: ${msg}`);
    }
  }

  return {
    success: false,
    provider: "none",
    model: "none",
    answer: `All providers failed: ${errors.join(" | ")}`,
  };
}
