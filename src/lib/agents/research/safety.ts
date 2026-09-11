/**
 * SSRF protection and URL safety validation.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^\[::1\]$/,
  /^169\.254\./,
];

const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];

export function isUrlSafe(urlString: string): { safe: boolean; reason?: string } {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, reason: "Invalid URL format" };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { safe: false, reason: "Only HTTP(S) URLs allowed" };
  }

  const hostname = url.hostname.toLowerCase();

  if (BLOCKED_HOSTS.includes(hostname)) {
    return { safe: false, reason: "localhost/internal URLs blocked" };
  }

  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: "Private/internal IP blocked" };
    }
  }

  return { safe: true };
}

export async function safeFetch(url: string, opts?: {
  timeoutMs?: number;
  maxSizeBytes?: number;
  maxRedirects?: number;
}): Promise<{ ok: boolean; status: number; body: string; error?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const maxSizeBytes = opts?.maxSizeBytes ?? 500_000;
  const maxRedirects = opts?.maxRedirects ?? 3;

  const safety = isUrlSafe(url);
  if (!safety.safe) {
    return { ok: false, status: 0, body: "", error: safety.reason };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "NexusCrew-Research/1.0" },
      redirect: "follow",
    });

    let redirectCount = 0;
    while (res.redirected && redirectCount < maxRedirects) {
      redirectCount++;
      res = await fetch(res.url, {
        signal: controller.signal,
        headers: { "User-Agent": "NexusCrew-Research/1.0" },
        redirect: "follow",
      });
    }

    if (redirectCount >= maxRedirects) {
      return { ok: false, status: 0, body: "", error: "Too many redirects" };
    }

    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > maxSizeBytes) {
      return { ok: false, status: res.status, body: "", error: "Response too large" };
    }

    const text = await res.text();
    const body = text.slice(0, maxSizeBytes);

    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 0, body: "", error: `Timeout after ${timeoutMs}ms` };
    }
    return { ok: false, status: 0, body: "", error: err instanceof Error ? err.message : "Fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}
