import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExportProfile, StageName } from "@vietvoice/contracts";

export interface EditorDocument { version: number; values: Record<string, unknown>; changedFields: string[] }
export interface ExportRecord { id: string; ownerId: string; projectId: string; profile: ExportProfile; editorVersion: number; createdAt: string; status: "queued" }

export class EditorStore {
  private readonly documents = new Map<string, EditorDocument>();
  private readonly exports = new Map<string, ExportRecord[]>();
  constructor(private readonly persistencePath?: string) { this.restore(); }

  patch(key: string, expectedVersion: number, changes: Record<string, unknown>, invalidatedStages: StageName[]) {
    const current = this.documents.get(key) ?? { version: 0, values: {}, changedFields: [] };
    if (current.version !== expectedVersion) return { conflict: true as const, current };
    const changedFields = Object.keys(changes);
    const next = { version: current.version + 1, values: { ...current.values, ...changes }, changedFields };
    this.documents.set(key, next);
    this.persist();
    return { conflict: false as const, document: next, invalidatedStages };
  }

  createExport(ownerId: string, projectId: string, profile: ExportProfile): ExportRecord {
    const key = `${ownerId}:${projectId}`;
    const record: ExportRecord = { id: randomUUID(), ownerId, projectId, profile: structuredClone(profile), editorVersion: this.documents.get(key)?.version ?? 0, createdAt: new Date().toISOString(), status: "queued" };
    this.exports.set(key, [...(this.exports.get(key) ?? []), record]);
    this.persist();
    return record;
  }

  listExports(ownerId: string, projectId: string): ExportRecord[] { return structuredClone(this.exports.get(`${ownerId}:${projectId}`) ?? []); }
  getExport(ownerId: string, exportId: string): ExportRecord | null { for (const records of this.exports.values()) { const record = records.find((item) => item.ownerId === ownerId && item.id === exportId); if (record) return structuredClone(record); } return null; }

  private restore(): void {
    if (!this.persistencePath) return;
    try {
      const state = JSON.parse(readFileSync(this.persistencePath, "utf8")) as { documents?: Array<[string, EditorDocument]>; exports?: Array<[string, ExportRecord[]]> };
      for (const [key, document] of state.documents ?? []) this.documents.set(key, document);
      for (const [key, records] of state.exports ?? []) this.exports.set(key, records);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }

  private persist(): void {
    if (!this.persistencePath) return;
    mkdirSync(dirname(this.persistencePath), { recursive: true });
    const temporary = `${this.persistencePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ documents: [...this.documents], exports: [...this.exports] }), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.persistencePath);
  }
}
