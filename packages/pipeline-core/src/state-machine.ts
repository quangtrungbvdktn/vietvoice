import { randomUUID } from "node:crypto";
import type { StageName, StageStatus } from "@vietvoice/contracts";
import { PipelineError } from "./errors.js";

export interface PipelineRun { id: string; stage: StageName; status: StageStatus; progress: number; attempt: number; sequence: number; artifactId?: string; error?: string }
export interface StageLease { id: string; runId: string; stage: StageName; deviceId: string; sequence: number }
export interface StageArtifact { id: string; runId: string; stage: StageName; value: unknown }

export class PipelineEngine {
  private readonly runs = new Map<string, PipelineRun>();
  private readonly leases = new Map<string, StageLease>();
  private readonly artifacts = new Map<string, StageArtifact>();

  createRun(id: string, stage: StageName): PipelineRun { const run: PipelineRun = { id, stage, status: "queued", progress: 0, attempt: 1, sequence: 0 }; this.runs.set(id, run); return run; }
  getRun(id: string): PipelineRun { const run = this.runs.get(id); if (!run) throw new PipelineError("RUN_NOT_FOUND", "Không tìm thấy tác vụ."); return run; }
  claimStage(runId: string, deviceId: string): StageLease { const run = this.getRun(runId); if (run.status === "cancelled") throw new PipelineError("RUN_CANCELLED", "Tác vụ đã bị hủy."); if (run.status === "paused") throw new PipelineError("RUN_PAUSED", "Tác vụ đang tạm dừng."); run.status = "running"; run.sequence += 1; const lease = { id: randomUUID(), runId, stage: run.stage, deviceId, sequence: run.sequence }; this.leases.set(lease.id, lease); return lease; }
  reportProgress(leaseId: string, progress: number): PipelineRun { const lease = this.requireLease(leaseId); const run = this.getRun(lease.runId); run.progress = Math.max(run.progress, Math.min(100, progress)); return run; }
  completeStage(leaseId: string, value: unknown): StageArtifact { const lease = this.requireLease(leaseId); const run = this.getRun(lease.runId); if (run.status === "cancelled") throw new PipelineError("RUN_CANCELLED", "Tác vụ đã bị hủy."); if (run.artifactId) return this.artifacts.get(run.artifactId)!; const artifact = { id: randomUUID(), runId: run.id, stage: run.stage, value }; this.artifacts.set(artifact.id, artifact); run.artifactId = artifact.id; run.progress = 100; run.status = "completed"; return artifact; }
  failStage(leaseId: string, publicMessage: string): PipelineRun { const lease = this.requireLease(leaseId); const run = this.getRun(lease.runId); run.status = "failed"; run.error = publicMessage; return run; }
  cancelRun(id: string): PipelineRun { const run = this.getRun(id); run.status = "cancelled"; return run; }
  pauseRun(id: string): PipelineRun { const run = this.getRun(id); if (run.status !== "completed" && run.status !== "cancelled") run.status = "paused"; return run; }
  resumeRun(id: string): PipelineRun { const run = this.getRun(id); if (run.status === "completed") return run; run.status = "queued"; delete run.error; run.attempt += 1; return run; }
  reconcile(runId: string, agentLastAck: number) { const run = this.getRun(runId); if (run.status === "completed" && run.artifactId && agentLastAck < run.sequence) return { nextAction: { type: "ack_completed" as const, artifactId: run.artifactId } }; return { nextAction: { type: "continue" as const } }; }
  getCompletedArtifact(runId: string): StageArtifact | null { const run = this.getRun(runId); return run.status === "completed" && run.artifactId ? this.artifacts.get(run.artifactId) ?? null : null; }
  private requireLease(id: string): StageLease { const lease = this.leases.get(id); if (!lease) throw new PipelineError("LEASE_NOT_FOUND", "Phiên xử lý không còn hiệu lực."); return lease; }
}
