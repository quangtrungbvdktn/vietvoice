import { describe, expect, it, vi } from "vitest";
import { ChunkedRecognizer, type ChunkCheckpointStore, type SpeechChunk } from "../src/main/asr/chunked-recognizer.js";
import type { Transcript } from "../src/main/asr/types.js";

const chunks: SpeechChunk[] = [
  { index: 0, path: "0.wav", startMs: 0, endMs: 30_000, sha256: "0".repeat(64) },
  { index: 1, path: "1.wav", startMs: 31_000, endMs: 61_000, sha256: "1".repeat(64) },
  { index: 2, path: "2.wav", startMs: 62_000, endMs: 92_000, sha256: "2".repeat(64) },
];

function memoryStore(): ChunkCheckpointStore & { values: Map<string, Transcript> } {
  const values = new Map<string, Transcript>();
  return { values, get: async (key) => values.get(key) ?? null, put: async (key, value) => { values.set(key, value); } };
}

describe("ChunkedRecognizer", () => {
  it("recognizes ordered chunks and offsets mixed-language timestamps", async () => {
    const decode = vi.fn(async (chunk: SpeechChunk) => ({ text: chunk.index === 0 ? "你好" : "OpenAI", segments: [{ startMs: 0, endMs: 100, text: chunk.index === 0 ? "你好" : "OpenAI" }] }));
    const result = await new ChunkedRecognizer({ detectSpeechChunks: async () => chunks.slice(0, 2), decode }, memoryStore())
      .recognize({ audioPath: "all.wav", language: "auto", audioSha256: "a".repeat(64) }, "identity");
    expect(result.text).toBe("你好 OpenAI");
    expect(result.segments[1]).toEqual({ startMs: 31_000, endMs: 31_100, text: "OpenAI" });
  });

  it("resumes valid checkpoints without decoding them again", async () => {
    const store = memoryStore();
    const firstDecode = vi.fn(async (chunk: SpeechChunk) => ({ text: `段${chunk.index}`, segments: [{ startMs: 0, endMs: 100, text: `段${chunk.index}` }] }));
    await new ChunkedRecognizer({ detectSpeechChunks: async () => chunks.slice(0, 2), decode: firstDecode }, store)
      .recognize({ audioPath: "all.wav", language: "zh", audioSha256: "a".repeat(64) }, "identity");
    const resumedDecode = vi.fn(async () => ({ text: "新", segments: [{ startMs: 0, endMs: 100, text: "新" }] }));
    await new ChunkedRecognizer({ detectSpeechChunks: async () => chunks, decode: resumedDecode }, store)
      .recognize({ audioPath: "all.wav", language: "zh", audioSha256: "a".repeat(64) }, "identity");
    expect(resumedDecode).toHaveBeenCalledTimes(1);
  });

  it("stops between chunks when cancelled and keeps completed checkpoints", async () => {
    const store = memoryStore(); const controller = new AbortController();
    const decode = vi.fn(async (chunk: SpeechChunk) => { if (chunk.index === 0) controller.abort(); return { text: "中", segments: [{ startMs: 0, endMs: 100, text: "中" }] }; });
    await expect(new ChunkedRecognizer({ detectSpeechChunks: async () => chunks, decode }, store)
      .recognize({ audioPath: "all.wav", language: "zh", audioSha256: "a".repeat(64) }, "identity", controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(store.values.size).toBe(1);
  });
});
