import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StageStatus } from "@vietvoice/contracts";

export interface JobRecord {
  id: string; ownerId: string; projectId: string; sourceIds: string[];
  mode: "translate_subtitle" | "translate_dub"; concurrency: number;
  stage: "video_input"; status: StageStatus; progress: number; attempt: number; sequence: number;
  leaseId?: string; deviceId?: string; artifact?: { path: string; sha256: string };
  errorCode?: string; error?: string;
}

export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  constructor(private readonly persistencePath?: string) { this.restore(); }

  create(input: Pick<JobRecord, "ownerId" | "projectId" | "sourceIds" | "mode" | "concurrency">): JobRecord {
    const record: JobRecord = { id: randomUUID(), ...structuredClone(input), stage: "video_input", status: "queued", progress: 0, attempt: 1, sequence: 0 };
    this.jobs.set(record.id, record); this.persist(); return structuredClone(record);
  }
  list(ownerId: string, projectId: string): JobRecord[] { return [...this.jobs.values()].filter((job) => job.ownerId === ownerId && job.projectId === projectId).map((job) => structuredClone(job)); }
  action(id: string, ownerId: string, action: "cancel" | "pause" | "resume" | "retry"): JobRecord | null {
    const job = this.jobs.get(id); if (!job || job.ownerId !== ownerId) return null;
    if (action === "cancel") job.status = "cancelled";
    else if (action === "pause") job.status = "paused";
    else { job.status = "queued"; job.attempt += 1; job.progress = Math.min(job.progress, 99); delete job.errorCode; delete job.error; }
    delete job.leaseId; delete job.deviceId; this.persist(); return structuredClone(job);
  }
  claim(ownerId: string, deviceId: string): JobRecord | null {
    const job = [...this.jobs.values()].find((item) => item.ownerId === ownerId && item.status === "queued" && !item.leaseId);
    if (!job) return null;
    job.leaseId = randomUUID(); job.deviceId = deviceId; job.status = "running"; job.sequence += 1; this.persist(); return structuredClone(job);
  }
  complete(id: string, ownerId: string, leaseId: string, artifact: { path: string; sha256: string }): JobRecord | null {
    const job = this.jobs.get(id); if (!job || job.ownerId !== ownerId || job.leaseId !== leaseId || job.status !== "running") return null;
    job.artifact = structuredClone(artifact); job.status = "completed"; job.progress = 100; this.persist(); return structuredClone(job);
  }
  fail(id: string, ownerId: string, leaseId: string, failure: { code: string; message: string }): JobRecord | null {
    const job = this.jobs.get(id); if (!job || job.ownerId !== ownerId || job.leaseId !== leaseId || job.status !== "running") return null;
    job.status = "failed"; job.errorCode = failure.code; job.error = failure.message;
    delete job.leaseId; delete job.deviceId; this.persist(); return structuredClone(job);
  }

  private restore(): void { if (!this.persistencePath) return; try { for (const job of JSON.parse(readFileSync(this.persistencePath, "utf8")) as JobRecord[]) this.jobs.set(job.id, job); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
  private persist(): void { if (!this.persistencePath) return; mkdirSync(dirname(this.persistencePath), { recursive: true }); const temporary = `${this.persistencePath}.tmp`; writeFileSync(temporary, JSON.stringify([...this.jobs.values()]), { encoding: "utf8", mode: 0o600 }); renameSync(temporary, this.persistencePath); }
}
