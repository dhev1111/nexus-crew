/** Storage provider abstraction — swap implementation without touching agents */

export interface StoredMission {
  id: string;
  data: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface StorageProvider {
  saveMission(id: string, data: unknown): Promise<void>;
  getMission(id: string): Promise<unknown | null>;
  listMissions(limit?: number): Promise<Array<{ id: string; updatedAt: number; summary?: string }>>;
  deleteMission(id: string): Promise<boolean>;
}
