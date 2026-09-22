import { describe, expect, it } from "vitest";
import { LocalJobExecutor, type LocalStageName, type StageCache } from "../src/main/jobs/local-job-executor.js";

class MemoryStageCache implements StageCache {
  readonly values = new Map<string, unknown>();
  async get(jobId: string, sourceId: string, stage: LocalStageName, identity?: string): Promise<unknown | null> {
    return this.values.get(`${jobId}:${sourceId}:${stage}:${identity ?? ""}`) ?? this.values.get(`${jobId}:${sourceId}:${stage}`) ?? null;
  }
  async put(jobId: string, sourceId: string, stage: LocalStageName, value: unknown, identity?: string): Promise<void> {
    this.values.set(`${jobId}:${sourceId}:${stage}:${identity ?? ""}`, value);
  }
}

describe("local job executor", () => {
  it("resumes after restart without rerunning completed stages", async () => {
    const cache = new MemoryStageCache();
    cache.values.set("job-1:local:ep-1:video_input", { path: "D:\\Series\\ep-1.mp4" });
    cache.values.set("job-1:local:ep-1:media_processing", { path: "D:\\Jobs\\job-1\\normalized.mp4" });
    const calls: LocalStageName[] = [];
    const executor = new LocalJobExecutor(cache, async ({ stage }) => {
      calls.push(stage);
      if (stage === "export") return { path: "D:\\Exports\\ep-1.mp4", sha256: "a".repeat(64) };
      return { stage };
    });

    const artifact = await executor.execute({
      id: "job-1", leaseId: "lease-1", sourceIds: ["local:ep-1"], mode: "translate_subtitle", concurrency: 1,
    });

    expect(calls).toEqual([
      "audio_extraction", "speech_recognition", "language_detection", "transcript",
      "subtitle_generation", "translation", "video_rendering", "export",
    ]);
    expect(artifact).toEqual({ path: "D:\\Exports\\ep-1.mp4", sha256: "a".repeat(64) });
  });

  it("runs voice generation and audio sync only for dubbing mode", async () => {
    const cache = new MemoryStageCache();
    const calls: LocalStageName[] = [];
    const executor = new LocalJobExecutor(cache, async ({ stage }) => {
      calls.push(stage);
      return stage === "export"
        ? { path: "D:\\Exports\\dub.mp4", sha256: "b".repeat(64) }
        : { stage };
    });

    await executor.execute({ id: "job-2", leaseId: "lease-2", sourceIds: ["local:ep-2"], mode: "translate_dub", concurrency: 1 });

    expect(calls).toContain("voice_generation");
    expect(calls).toContain("audio_sync");
  });

  it("does not cache a failed stage", async () => {
    const cache = new MemoryStageCache();
    let attempts = 0;
    const executor = new LocalJobExecutor(cache, async ({ stage }) => {
      if (stage === "speech_recognition" && ++attempts === 1) throw new Error("ASR unavailable");
      return stage === "export" ? { path: "D:\\Exports\\ep.mp4", sha256: "c".repeat(64) } : { stage };
    });
    const job = { id: "job-3", leaseId: "lease-3", sourceIds: ["local:ep-3"], mode: "translate_subtitle" as const, concurrency: 1 };

    await expect(executor.execute(job)).rejects.toThrow("ASR unavailable");
    await expect(executor.execute(job)).resolves.toEqual({ path: "D:\\Exports\\ep.mp4", sha256: "c".repeat(64) });
    expect(attempts).toBe(2);
  });

  it("versions recognition and downstream cache entries with the ASR identity", async () => {
    const cache = new MemoryStageCache();
    cache.values.set("job-4:local:ep-4:speech_recognition:old-model", { text: "旧", segments: [] });
    const calls: LocalStageName[] = [];
    const executor = new LocalJobExecutor(cache, async ({ stage }) => {
      calls.push(stage);
      return stage === "export" ? { path: "D:\\Exports\\new.mp4", sha256: "d".repeat(64) } : { stage };
    }, () => "new-model");
    await executor.execute({ id: "job-4", leaseId: "lease-4", sourceIds: ["local:ep-4"], mode: "translate_subtitle", concurrency: 1 });
    expect(calls).toContain("speech_recognition");
    expect(cache.values.has("job-4:local:ep-4:translation:new-model")).toBe(true);
  });
});
