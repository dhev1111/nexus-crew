import type { StorageProvider } from "./types";
import { memoryStorage } from "./memory";
import { fileStorage } from "./file";
import { kvStorage, hasKvConfig, PERSISTENCE_ERROR } from "./kv";

/**
 * Default: file storage in development (persistent), KV on Vercel when configured,
 * memory only when explicitly requested. On Vercel without KV, do NOT silently
 * claim durable storage — return an unconfigured provider that fails clearly.
 */
function hasKv(): boolean {
  return hasKvConfig();
}

function createUnconfiguredStorage(): StorageProvider {
  const err = PERSISTENCE_ERROR;
  return {
    async saveMission() {
      throw new Error(err);
    },
    async getMission() {
      throw new Error(err);
    },
    async deleteMission() {
      throw new Error(err);
    },
    async listMissions() {
      throw new Error(err);
    },
  };
}

function createStorage(): StorageProvider {
  const mode = (process.env.STORAGE_PROVIDER || "").toLowerCase();
  if (mode === "memory") return memoryStorage;
  if (mode === "file") return fileStorage;
  if (hasKv()) return kvStorage;
  // Auto: KV if configured, otherwise file locally, error on Vercel
  if (process.env.VERCEL) {
    return createUnconfiguredStorage();
  }
  return fileStorage;
}

export const storage = createStorage();
export { createStorage, hasKvConfig, hasKv, PERSISTENCE_ERROR, createUnconfiguredStorage };
export type { StorageProvider, StoredMission } from "./types";
