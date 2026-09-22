import type { PipelineEngine } from "@vietvoice/pipeline-core";
export function reconcileAgent(engine: PipelineEngine, runId: string, lastAck: number) { return engine.reconcile(runId, lastAck); }
