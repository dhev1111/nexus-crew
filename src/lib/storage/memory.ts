import type { StorageProvider } from "./types";

/** In-memory store (works on Vercel serverless within a single invocation / warm instance). */
const store = new Map<string, { data: unknown; createdAt: number; updatedAt: number }>();

export const memoryStorage: StorageProvider = {
  async saveMission(id, data) {
    const now = Date.now();
    const existing = store.get(id);
    store.set(id, {
      data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  },
  async getMission(id) {
    return store.get(id)?.data ?? null;
  },
  async listMissions(limit = 50) {
    return Array.from(store.entries())
      .map(([id, v]) => ({
        id,
        updatedAt: v.updatedAt,
        summary: (v.data as { mission?: string })?.mission?.slice(0, 80),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  },
  async deleteMission(id) {
    return store.delete(id);
  },
};
