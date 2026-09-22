import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LocalJobExecutor } from "../src/main/jobs/local-job-executor.js";
import { JsonStageCache } from "../src/main/jobs/json-stage-cache.js";
import { createRealStageRunner } from "../src/main/jobs/real-stage-runner.js";

describe("real local stage runner", () => {
  it("extracts audio, translates timed segments, uses Edge TTS, and renders an export", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-real-runner-"));
    const source = join(directory, "episode.mp4");
    await writeFile(source, "source-video");
    const render = vi.fn(async (input: { output: string }) => writeFile(input.output, "rendered-video"));
    const cloud = {
      recognize: vi.fn(),
      translateSegments: vi.fn(async () => ["Xin chào.", "Tạm biệt."]),
      synthesizeVoice: vi.fn(),
    };
    const asr = {
      recognize: vi.fn(async () => ({ text: "你好。再见。", segments: [
        { startMs: 0, endMs: 1000, text: "你好。" },
        { startMs: 1000, endMs: 2200, text: "再见。" },
      ], engine: "paraformer-local" as const, cacheIdentity: "v1" })),
    };
    const edgeVoice = vi.fn(async (input: { outputPath: string }) => {
      await writeFile(input.outputPath, "edge-audio");
      return { audioUrl: "file:///voice.mp3", durationMs: 2200 };
    });
    const runner = createRealStageRunner({
      workDirectory: directory,
      sourceCatalog: { resolve: async () => source },
      cloud, asr,
      probe: async () => ({ durationMs: 2200, sizeBytes: 12 }),
      extractAudio: async (_input, output) => writeFile(output, "speech-audio"),
      edgeVoice,
      render,
    });
    const executor = new LocalJobExecutor(new JsonStageCache(directory), runner);

    const artifact = await executor.execute({ id: "job-1", leaseId: "lease-1", sourceIds: ["local:ep-1"], mode: "translate_dub", concurrency: 1 });

    expect(await readFile(artifact.path, "utf8")).toBe("rendered-video");
    expect(artifact.sha256).toMatch(/^[a-f\d]{64}$/);
    expect(edgeVoice).toHaveBeenCalledWith(expect.objectContaining({ text: "Xin chào.\nTạm biệt.", voice: "vi-VN-HoaiMyNeural" }));
    expect(cloud.synthesizeVoice).not.toHaveBeenCalled();
    expect(cloud.recognize).not.toHaveBeenCalled();
    expect(asr.recognize).toHaveBeenCalledWith(expect.objectContaining({ audioPath: expect.stringMatching(/speech\.wav$/) }));
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.stringMatching(/voice\.mp3$/), subtitles: expect.stringMatching(/translated\.srt$/) }));
    expect(await readFile(join(directory, "job-1", "3b45485b9afb", "translated.srt"), "utf8")).toContain("Xin chào.");
  });

  it("uses Gemini TTS only after Edge TTS fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-real-runner-"));
    const source = join(directory, "episode.mp4");
    await writeFile(source, "source-video");
    const cloud = {
      recognize: vi.fn(),
      translateSegments: vi.fn(async () => ["Xin chào"]),
      synthesizeVoice: vi.fn(async () => ({ audioBase64: Buffer.from("gemini-audio").toString("base64"), mimeType: "audio/L16;rate=24000", durationMs: 1000 })),
    };
    const runner = createRealStageRunner({
      workDirectory: directory,
      sourceCatalog: { resolve: async () => source }, cloud,
      asr: { recognize: vi.fn(async () => ({ text: "Hello", segments: [{ startMs: 0, endMs: 1000, text: "Hello" }], engine: "paraformer-local" as const, cacheIdentity: "v1" })) },
      probe: async () => ({ durationMs: 1000, sizeBytes: 12 }),
      extractAudio: async (_input, output) => writeFile(output, "speech-audio"),
      edgeVoice: vi.fn(async () => { throw Object.assign(new Error("Edge unavailable"), { code: "EDGE_TTS_FAILED" }); }),
      render: async ({ output }) => writeFile(output, "rendered-video"),
    });
    const executor = new LocalJobExecutor(new JsonStageCache(directory), runner);

    await executor.execute({ id: "job-2", leaseId: "lease-2", sourceIds: ["local:ep-2"], mode: "translate_dub", concurrency: 1 });

    expect(cloud.synthesizeVoice).toHaveBeenCalledTimes(1);
    const fallbackAudio = await readFile(join(directory, "job-2", "af439c0d02df", "voice.wav"));
    expect(fallbackAudio.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(fallbackAudio.subarray(-12).toString("utf8")).toBe("gemini-audio");
  });
});
