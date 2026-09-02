import type { StorageProvider } from "./types";
import { memoryStorage } from "./memory";
import { fileStorage } from "./file";

/**
 * Default: file storage in development (persistent), memory on Vercel serverless
 * unless STORAGE_PROVIDER=file is forced (not recommended on read-only FS).
 */
function createStorage(): StorageProvider {
  const mode = (process.env.STORAGE_PROVIDER || "").toLowerCase();
  if (mode === "memory") return memoryStorage;
  if (mode === "file") return fileStorage;
  // Auto: file locally, memory on Vercel
  if (process.env.VERCEL) return memoryStorage;
  return fileStorage;
}

export const storage = createStorage();
export type { StorageProvider, StoredMission } from "./types";
