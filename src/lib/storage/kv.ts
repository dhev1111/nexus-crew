import type { StorageProvider } from "./types";

const NAMESPACE = "nexus:mission:";
const PERSISTENCE_ERROR = "Mission persistence is not configured";

function hasKvConfig(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getKvConfig(): { url: string; token: string } {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error(PERSISTENCE_ERROR);
  return { url: url.replace(/\/$/, ""), token };
}

function validateId(id: string): void {
  if (typeof id !== "string" || id.length === 0 || id.length > 128) {
    throw new Error("Invalid mission ID");
  }
  // Allow only alphanumerics, underscore, hyphen — mission_... format
  // Reject path traversal, colons, slashes, spaces, etc.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("Invalid mission ID");
  }
  if (id.includes("..")) throw new Error("Invalid mission ID");
}

function keyFor(id: string): string {
  validateId(id);
  return `${NAMESPACE}${id}`;
}

async function kvCommand(args: string[]): Promise<unknown> {
  const { url, token } = getKvConfig();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
  } catch (e) {
    throw new Error(`KV request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new Error(`KV HTTP ${res.status}`);
  }
  let json: { result?: unknown; error?: string };
  try {
    json = (await res.json()) as { result?: unknown; error?: string };
  } catch {
    throw new Error("KV malformed JSON");
  }
  if (json.error) {
    throw new Error(`KV error: ${json.error}`);
  }
  return json.result;
}

export const kvStorage: StorageProvider = {
  async saveMission(id, data) {
    const key = keyFor(id);
    const value = JSON.stringify(data);
    // Do not store API keys — MissionState should not contain them; store as-is
    await kvCommand(["SET", key, value]);
  },

  async getMission(id) {
    const key = keyFor(id);
    const result = await kvCommand(["GET", key]);
    if (result === null || result === undefined) return null;
    const raw = typeof result === "string" ? result : JSON.stringify(result);
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      // Handle malformed stored data without crashing
      console.warn("[kv] malformed stored JSON for mission", id);
      return null;
    }
  },

  async deleteMission(id) {
    const key = keyFor(id);
    const result = await kvCommand(["DEL", key]);
    return result === 1 || result === "1" || result === true;
  },

  async listMissions(limit = 50) {
    let keys: string[] = [];
    try {
      const result = await kvCommand(["KEYS", `${NAMESPACE}*`]);
      if (Array.isArray(result)) keys = result as string[];
      else if (result === null) keys = [];
      else keys = [];
    } catch {
      // If KEYS not supported, try SCAN
      try {
        const scanResult = await kvCommand(["SCAN", "0", "MATCH", `${NAMESPACE}*`, "COUNT", String(limit * 2)]);
        // SCAN returns [cursor, [keys]]
        if (Array.isArray(scanResult) && Array.isArray(scanResult[1])) {
          keys = scanResult[1] as string[];
        }
      } catch {
        return [];
      }
    }
    keys = keys.slice(0, limit);
    const items: Array<{ id: string; updatedAt: number; summary?: string }> = [];
    for (const fullKey of keys) {
      const missionId = fullKey.startsWith(NAMESPACE) ? fullKey.slice(NAMESPACE.length) : fullKey;
      try {
        validateId(missionId);
      } catch {
        continue;
      }
      try {
        const raw = await kvCommand(["GET", fullKey]);
        if (raw === null || raw === undefined) continue;
        const str = typeof raw === "string" ? raw : JSON.stringify(raw);
        let parsed: unknown;
        try {
          parsed = JSON.parse(str);
        } catch {
          continue;
        }
        const p = parsed as { mission?: string; updatedAt?: number };
        items.push({
          id: missionId,
          updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
          summary: typeof p.mission === "string" ? p.mission.slice(0, 80) : undefined,
        });
      } catch {
        continue;
      }
    }
    return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  },
};

export { hasKvConfig, PERSISTENCE_ERROR, validateId, keyFor, kvCommand };
