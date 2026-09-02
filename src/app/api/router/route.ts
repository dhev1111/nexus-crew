import { NextResponse } from "next/server";
import { checkRouterHealth, isRouterConfigured } from "@/lib/ai-router";
import { isLLMConfigured } from "@/lib/providers/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/router — AI Router health + backend configuration status.
 * Never returns secrets.
 */
export async function GET() {
  const routerConfigured = isRouterConfigured();
  const health = routerConfigured
    ? await checkRouterHealth(4000)
    : { online: false, url: "", detail: "AI_ROUTER_URL not set" };

  return NextResponse.json({
    service: "Nexus Crew",
    backend: {
      llmConfigured: isLLMConfigured(),
      routerConfigured,
      routerOnline: health.online,
      routerUrl: health.url ? maskUrl(health.url) : null,
      latencyMs: health.latencyMs ?? null,
      detail: health.detail ?? null,
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
