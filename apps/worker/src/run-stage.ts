import type { PipelineEngine, StageArtifact } from "@vietvoice/pipeline-core";

const inFlight = new WeakMap<PipelineEngine, Map<string, Promise<StageArtifact>>>();

export function runStage(engine: PipelineEngine, runId: string, deviceId: string, execute: () => Promise<unknown>): Promise<StageArtifact> {
  const completed = engine.getCompletedArtifact(runId);
  if (completed) return Promise.resolve(completed);
  const activeRuns = inFlight.get(engine) ?? new Map<string, Promise<StageArtifact>>();
  inFlight.set(engine, activeRuns);
  const active = activeRuns.get(runId);
  if (active) return active;
  const promise = executeOnce(engine, runId, deviceId, execute).finally(() => activeRuns.delete(runId));
  activeRuns.set(runId, promise);
  return promise;
}

async function executeOnce(engine: PipelineEngine, runId: string, deviceId: string, execute: () => Promise<unknown>): Promise<StageArtifact> {
  const lease = engine.claimStage(runId, deviceId);
  try { return engine.completeStage(lease.id, await execute()); }
  catch (error) {
    if (engine.getRun(runId).status !== "cancelled") engine.failStage(lease.id, error instanceof Error ? error.message : "Xử lý thất bại.");
    throw error;
  }
}
