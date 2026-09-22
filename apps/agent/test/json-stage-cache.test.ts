import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStageCache } from "../src/main/jobs/json-stage-cache.js";

describe("JSON stage cache", () => {
  it("restores completed stage artifacts after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-stage-cache-"));
    const first = new JsonStageCache(directory);
    await first.put("job-1", "local:ep-1", "translation", { path: "D:\\Jobs\\job-1\\translation.json", language: "vi" });

    const restarted = new JsonStageCache(directory);
    await expect(restarted.get("job-1", "local:ep-1", "translation")).resolves.toEqual({
      path: "D:\\Jobs\\job-1\\translation.json", language: "vi",
    });
  });

  it("serializes concurrent writes without losing either stage", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-stage-cache-"));
    const cache = new JsonStageCache(directory);
    await Promise.all([
      cache.put("job-2", "local:ep-2", "audio_extraction", { path: "audio.wav" }),
      cache.put("job-2", "local:ep-2", "speech_recognition", { path: "transcript.json" }),
    ]);

    await expect(cache.get("job-2", "local:ep-2", "audio_extraction")).resolves.toEqual({ path: "audio.wav" });
    await expect(cache.get("job-2", "local:ep-2", "speech_recognition")).resolves.toEqual({ path: "transcript.json" });
  });

  it("misses when a stage cache identity changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-stage-cache-"));
    const cache = new JsonStageCache(directory);
    await cache.put("job-3", "local:ep-3", "speech_recognition", { text: "旧" }, "model-a");
    await expect(cache.get("job-3", "local:ep-3", "speech_recognition", "model-a")).resolves.toEqual({ text: "旧" });
    await expect(cache.get("job-3", "local:ep-3", "speech_recognition", "model-b")).resolves.toBeNull();
  });
});
