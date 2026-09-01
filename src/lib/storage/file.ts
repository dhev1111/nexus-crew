import { promises as fs } from "fs";
import path from "path";
import type { StorageProvider } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "missions");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

export const fileStorage: StorageProvider = {
  async saveMission(id, data) {
    await ensureDir();
    const file = path.join(DATA_DIR, `${safeId(id)}.json`);
    const now = Date.now();
    let createdAt = now;
    try {
      const prev = JSON.parse(await fs.readFile(file, "utf8"));
      createdAt = prev.createdAt ?? now;
    } catch {
      /* new */
    }
    await fs.writeFile(
      file,
      JSON.stringify({ id, data, createdAt, updatedAt: now }, null, 2),
      "utf8"
    );
  },

  async getMission(id) {
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, `${safeId(id)}.json`), "utf8");
      return JSON.parse(raw).data;
    } catch {
      return null;
    }
  },

  async listMissions(limit = 50) {
    try {
      await ensureDir();
      const files = await fs.readdir(DATA_DIR);
      const items: Array<{ id: string; updatedAt: number; summary?: string }> = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = await fs.readFile(path.join(DATA_DIR, f), "utf8");
          const parsed = JSON.parse(raw);
          items.push({
            id: parsed.id,
            updatedAt: parsed.updatedAt ?? 0,
            summary: parsed.data?.mission?.slice?.(0, 80),
          });
        } catch {
          /* skip corrupt */
        }
      }
      return items.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    } catch {
      return [];
    }
  },

  async deleteMission(id) {
    try {
      await fs.unlink(path.join(DATA_DIR, `${safeId(id)}.json`));
      return true;
    } catch {
      return false;
    }
  },
};
