import { NextRequest, NextResponse } from "next/server";
import { chatWithFallback } from "@/lib/ai-gateway/providers";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/ai-gateway — health check.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

/**
 * POST /api/ai-gateway — internal AI gateway with provider fallback.
 * Accepts: { message: string } or { messages: Array<{role, content}> }
 * Returns: { success, provider, model, answer }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    let prompt: string;

    if (Array.isArray(body.messages) && body.messages.length > 0) {
      prompt = body.messages
        .map((m: { role: string; content: string }) => `[${m.role.toUpperCase()}]\n${m.content}`)
        .join("\n\n");
    } else if (typeof body.message === "string" && body.message.trim()) {
      prompt = body.message.trim();
    } else {
      return NextResponse.json(
        { success: false, error: "Provide 'message' (string) or 'messages' array" },
        { status: 400 }
      );
    }

    if (prompt.length > 100_000) {
      return NextResponse.json(
        { success: false, error: "Message too long (max 100,000 characters)" },
        { status: 400 }
      );
    }

    console.log(`[AI GATEWAY] Request: ${prompt.length} chars`);

    const result = await chatWithFallback(prompt, 90_000);

    if (!result.success) {
      return NextResponse.json(result, { status: 502 });
    }

    console.log(`[AI GATEWAY] Success via ${result.provider} (${result.model})`);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal gateway error";
    console.error("[AI GATEWAY]", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
