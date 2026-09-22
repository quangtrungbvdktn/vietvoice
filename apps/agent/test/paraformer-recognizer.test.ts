import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { ParaformerRecognizer, type SpawnedProcess } from "../src/main/asr/paraformer-recognizer.js";

function processResult(output: string, exitCode = 0): SpawnedProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn(() => true) }) as SpawnedProcess;
  queueMicrotask(() => {
    stdout.end(output);
    stderr.end("");
    child.emit("close", exitCode, null);
  });
  return child;
}

function recognizer(spawnProcess: ReturnType<typeof vi.fn>, timeoutMs = 45_000) {
  return new ParaformerRecognizer({
    executablePath: "D:\\VietVoice Agent\\sherpa-onnx-offline.exe",
    modelPath: "D:\\VietVoice Agent\\model.int8.onnx",
    tokensPath: "D:\\VietVoice Agent\\tokens.txt",
    modelId: "sherpa-onnx-paraformer-zh-2023-09-14",
    runtimeVersion: "1.13.8",
    modelSha256: "a".repeat(64),
    tokensSha256: "b".repeat(64),
  }, { spawnProcess, threads: 4, timeoutMs });
}

describe("ParaformerRecognizer", () => {
  it("spawns the verified executable without a shell and preserves spaced paths", async () => {
    const spawnProcess = vi.fn(() => processResult('{"text":"你好","tokens":["你","好"],"timestamps":[0,0.5]}'));
    const result = await recognizer(spawnProcess).recognize({
      audioPath: "D:\\Công việc\\Vd Trung.wav", language: "zh", audioSha256: "b".repeat(64),
    }, { chunkStartMs: 0, chunkEndMs: 1_000 });
    expect(result.text).toBe("你好");
    expect(spawnProcess).toHaveBeenCalledWith(
      "D:\\VietVoice Agent\\sherpa-onnx-offline.exe",
      [
        "--tokens=D:\\VietVoice Agent\\tokens.txt",
        "--paraformer=D:\\VietVoice Agent\\model.int8.onnx",
        "--num-threads=4",
        "D:\\Công việc\\Vd Trung.wav",
      ],
      { shell: false, windowsHide: true },
    );
  });

  it("maps non-zero exit and malformed output to stable errors", async () => {
    await expect(recognizer(vi.fn(() => processResult("failed", 2))).recognize(
      { audioPath: "a.wav", language: "auto", audioSha256: "b".repeat(64) },
      { chunkStartMs: 0, chunkEndMs: 1_000 },
    )).rejects.toMatchObject({ code: "PARAFORMER_START_FAILED", fallbackEligible: true });
    await expect(recognizer(vi.fn(() => processResult("{"))).recognize(
      { audioPath: "a.wav", language: "auto", audioSha256: "b".repeat(64) },
      { chunkStartMs: 0, chunkEndMs: 1_000 },
    )).rejects.toMatchObject({ code: "PARAFORMER_OUTPUT_INVALID", fallbackEligible: true });
  });

  it("maps a process start error to the stable start error", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true),
    }) as SpawnedProcess;
    const pending = recognizer(vi.fn(() => child)).recognize(
      { audioPath: "a.wav", language: "zh", audioSha256: "b".repeat(64) }, { chunkStartMs: 0, chunkEndMs: 1_000 },
    );
    queueMicrotask(() => child.emit("error", new Error("ENOENT")));
    await expect(pending).rejects.toMatchObject({ code: "PARAFORMER_START_FAILED", fallbackEligible: true });
  });

  it("rejects stdout beyond the four MiB safety limit", async () => {
    await expect(recognizer(vi.fn(() => processResult(`{"text":"${"中".repeat(4 * 1024 * 1024)}"}`))).recognize(
      { audioPath: "a.wav", language: "zh", audioSha256: "b".repeat(64) }, { chunkStartMs: 0, chunkEndMs: 1_000 },
    )).rejects.toMatchObject({ code: "PARAFORMER_OUTPUT_INVALID", fallbackEligible: true });
  });

  it("kills the process when cancelled", async () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true),
    }) as SpawnedProcess;
    const controller = new AbortController();
    const pending = recognizer(vi.fn(() => child)).recognize(
      { audioPath: "a.wav", language: "zh", audioSha256: "b".repeat(64) },
      { chunkStartMs: 0, chunkEndMs: 1_000 }, controller.signal,
    );
    controller.abort();
    queueMicrotask(() => child.emit("close", null, "SIGTERM"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(child.kill).toHaveBeenCalled();
  });

  it("kills the process on timeout", async () => {
    vi.useFakeTimers();
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true),
    }) as SpawnedProcess;
    const pending = recognizer(vi.fn(() => child), 10).recognize(
      { audioPath: "a.wav", language: "zh", audioSha256: "b".repeat(64) }, { chunkStartMs: 0, chunkEndMs: 1_000 },
    );
    await vi.advanceTimersByTimeAsync(10);
    child.emit("close", null, "SIGTERM");
    await expect(pending).rejects.toMatchObject({ code: "PARAFORMER_TIMEOUT", fallbackEligible: true });
    vi.useRealTimers();
  });
});
