import { describe, expect, it, vi } from "vitest";
import { WorkQueues } from "../src/queue.js";
import { PipelineEngine } from "@vietvoice/pipeline-core";
import { runStage } from "../src/run-stage.js";

describe("work queues", () => {
  it("limits project concurrency to three and separates workloads", async () => {
    const queues = new WorkQueues(3);
    queues.enqueue({ id: "a", kind: "cloud_ai" });
    queues.enqueue({ id: "b", kind: "local_render" });
    expect(queues.take("cloud_ai")?.id).toBe("a");
    expect(queues.take("local_render")?.id).toBe("b");
    expect(() => new WorkQueues(4)).toThrow("QUEUE_CONCURRENCY_INVALID");
  });
});

it("does not repeat billable execution when a completed run is redelivered", async () => {
  const engine = new PipelineEngine(); engine.createRun("run-redelivery", "translation");
  const execute = vi.fn().mockResolvedValue({ translation: "Xin chào" });
  const first = await runStage(engine, "run-redelivery", "agent-1", execute);
  const second = await runStage(engine, "run-redelivery", "agent-1", execute);
  expect(second.id).toBe(first.id); expect(execute).toHaveBeenCalledOnce();
});

it("coalesces concurrent delivery of the same billable stage", async () => {
  const engine = new PipelineEngine(); engine.createRun("run-concurrent", "translation");
  let release!: () => void;
  const execute = vi.fn(() => new Promise((resolve) => { release = () => resolve({ translation: "Xin chào" }); }));
  const first = runStage(engine, "run-concurrent", "agent-1", execute);
  const second = runStage(engine, "run-concurrent", "agent-2", execute);
  release();
  const [a, b] = await Promise.all([first, second]);
  expect(a.id).toBe(b.id);
  expect(execute).toHaveBeenCalledOnce();
});

it("keeps a cancelled in-flight run cancelled when execution exits", async () => {
  const engine = new PipelineEngine(); engine.createRun("run-cancel", "translation");
  let rejectExecution!: (error: Error) => void;
  const running = runStage(engine, "run-cancel", "agent-1", () => new Promise((_resolve, reject) => { rejectExecution = reject; }));
  engine.cancelRun("run-cancel");
  rejectExecution(new Error("aborted"));
  await expect(running).rejects.toThrow("aborted");
  expect(engine.getRun("run-cancel").status).toBe("cancelled");
});
