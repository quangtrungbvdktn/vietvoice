import { randomUUID } from "node:crypto";
import { PublishError, type PublishProvider, type PublishRequest } from "./types.js";
interface ScheduledPublish { id: string; status: "queued"; request: PublishRequest; createdAt: string }
export class PublishService {
  private readonly scheduled: ScheduledPublish[] = [];
  constructor(private readonly provider: PublishProvider, private readonly now = () => new Date()) {}
  async publish(job: PublishRequest) {
    if (job.scheduledAt && new Date(job.scheduledAt).getTime() > this.now().getTime()) { const record = { id: randomUUID(), status: "queued" as const, request: structuredClone(job), createdAt: this.now().toISOString() }; this.scheduled.push(record); return { status: "queued" as const, jobId: record.id, scheduledAt: job.scheduledAt }; }
    try { return { status: "published" as const, ...await this.provider.publish(job) }; }
    catch (error) { if (error instanceof PublishError && (error.code === "PUBLISH_PERMISSION_REQUIRED" || error.code === "TOKEN_EXPIRED")) return { status: "manual_ready" as const, package: { files: [job.videoPath, "caption.txt"], caption: `${job.caption}\n${job.hashtags.join(" ")}`.trim() } }; throw error; }
  }
  listScheduled() { return structuredClone(this.scheduled); }
}
