import { describe, expect, it } from "vitest";
import { PipelineEngine, affectedStages, createCacheKey } from "./index.js";

describe("pipeline engine", () => {
  it("pauses and resumes a background run without losing progress", () => {
    const engine = new PipelineEngine();
    engine.createRun("pauseable", "video_rendering");
    const lease = engine.claimStage("pauseable", "device-a");
    engine.reportProgress(lease.id, 37);
    expect(engine.pauseRun("pauseable")).toMatchObject({ status: "paused", progress: 37 });
    expect(() => engine.claimStage("pauseable", "device-b")).toThrow("đang tạm dừng");
    expect(engine.resumeRun("pauseable")).toMatchObject({ status: "queued", progress: 37 });
  });

  it("invalidates only dependent work", () => {
    expect(affectedStages(["translation"])).toEqual(["translation", "voice_generation", "audio_sync", "video_rendering", "export"]);
    expect(affectedStages(["voice"])).toEqual(["voice_generation", "audio_sync", "video_rendering", "export"]);
    expect(affectedStages(["subtitle_style"])).toEqual(["video_rendering", "export"]);
  });

  it("creates stable dependency-aware cache keys", () => {
    expect(createCacheKey("translation", 2, { transcript: "a", language: "zh" })).toBe(createCacheKey("translation", 2, { language: "zh", transcript: "a" }));
  });

  it("reuses a completed billable stage after acknowledgement loss", () => {
    const engine = new PipelineEngine();
    const run = engine.createRun("run-1", "translation");
    const lease = engine.claimStage(run.id, "device-1");
    const artifact = engine.completeStage(lease.id, { translated: "xin chào" });
    const repeated = engine.completeStage(lease.id, { translated: "should not replace" });
    expect(repeated.id).toBe(artifact.id);
    expect(engine.reconcile(run.id, lease.sequence - 1)).toEqual({ nextAction: { type: "ack_completed", artifactId: artifact.id } });
  });

  it("cancels and resumes without losing completed stages", () => {
    const engine = new PipelineEngine();
    engine.createRun("run-2", "speech_recognition");
    engine.cancelRun("run-2");
    expect(engine.getRun("run-2").status).toBe("cancelled");
    engine.resumeRun("run-2");
    expect(engine.getRun("run-2").status).toBe("queued");
  });
  it("rejects completion from a cancelled stale lease", () => { const engine=new PipelineEngine(); engine.createRun("run-cancelled","video_rendering"); const lease=engine.claimStage("run-cancelled","agent-1"); engine.cancelRun("run-cancelled"); expect(()=>engine.completeStage(lease.id,{path:"partial.mp4"})).toThrow("Tác vụ đã bị hủy"); });
});
