import { describe, expect, it, vi } from "vitest";
import { AsrRouter } from "../src/main/asr/asr-router.js";
import type { AsrFailure, LocalAsrInput } from "../src/main/asr/types.js";

const input: LocalAsrInput = { audioPath: "D:\\Jobs\\speech.wav", language: "auto", audioSha256: "a".repeat(64) };
const transcript = { text: "你好世界", segments: [{ startMs: 0, endMs: 1_000, text: "你好世界" }] };
function eligible(code: AsrFailure["code"] = "PARAFORMER_START_FAILED"): AsrFailure {
  return Object.assign(new Error(code), { code, publicMessage: code, fallbackEligible: true }) as AsrFailure;
}

describe("AsrRouter", () => {
  it("returns local recognition without a cloud call", async () => {
    const cloud = { recognizeFallback: vi.fn() };
    const router = new AsrRouter({ recognize: vi.fn(async () => transcript) }, cloud, { cacheIdentity: "local-v1", cloudFallbackEnabled: true });
    await expect(router.recognize(input)).resolves.toMatchObject({ engine: "paraformer-local", cacheIdentity: "local-v1", text: "你好世界" });
    expect(cloud.recognizeFallback).not.toHaveBeenCalled();
  });

  it("calls Gemini then OpenRouter only after eligible failures", async () => {
    const order: string[] = [];
    const local = { recognize: vi.fn(async () => { order.push("local"); throw eligible(); }) };
    const cloud = { recognizeFallback: vi.fn(async (_path, _language, provider) => {
      order.push(provider); if (provider === "gemini-audio") throw new Error("quota"); return transcript;
    }) };
    const result = await new AsrRouter(local, cloud, { cacheIdentity: "v1", cloudFallbackEnabled: true }).recognize(input);
    expect(result.engine).toBe("openrouter-stt");
    expect(order).toEqual(["local", "gemini-audio", "openrouter-stt"]);
  });

  it("reports disabled fallback after an eligible local failure", async () => {
    const router = new AsrRouter({ recognize: vi.fn(async () => { throw eligible(); }) }, undefined, { cacheIdentity: "v1", cloudFallbackEnabled: false });
    await expect(router.recognize(input)).rejects.toMatchObject({ code: "ASR_FALLBACK_DISABLED" });
  });

  it("does not upload after cancellation or a non-eligible language review", async () => {
    const cloud = { recognizeFallback: vi.fn() };
    for (const error of [Object.assign(new Error("Aborted"), { name: "AbortError" }), Object.assign(eligible("ASR_LANGUAGE_REVIEW_REQUIRED"), { fallbackEligible: false })]) {
      const router = new AsrRouter({ recognize: vi.fn(async () => { throw error; }) }, cloud, { cacheIdentity: "v1", cloudFallbackEnabled: true });
      await expect(router.recognize(input)).rejects.toBe(error);
    }
    expect(cloud.recognizeFallback).not.toHaveBeenCalled();
  });
});
