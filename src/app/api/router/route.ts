import { NextResponse } from "next/server";
import { checkRouterHealth, isRouterConfigured } from "@/lib/ai-router";
import { isLLMConfigured } from "@/lib/providers/llm";
import { hasAnyProviderKey } from "@/lib/ai-gateway/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/router — AI Router health + backend configuration status.
 * Never returns secrets.
 */
export async function GET() {
  const routerConfigured = isRouterConfigured();
  const internalGateway = hasAnyProviderKey();
  const health = routerConfigured
    ? await checkRouterHealth(4000)
    : { online: false, url: "", detail: "AI_ROUTER_URL not set" };

  const llmConfigured = isLLMConfigured();

  return NextResponse.json({
    service: "Nexus Crew",
    backend: {
      llmConfigured,
      routerConfigured,
      internalGateway,
      routerOnline: routerConfigured ? health.online : internalGateway,
      routerUrl: health.url ? maskUrl(health.url) : null,
      latencyMs: health.latencyMs ?? null,
      detail: routerConfigured
        ? health.detail ?? null
        : internalGateway
          ? "Internal AI gateway active (provider fallback chain)"
          : "No AI provider keys configured",
    },
  });
}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "configured";
  }
}
