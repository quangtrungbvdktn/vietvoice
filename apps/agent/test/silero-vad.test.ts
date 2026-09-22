import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { SileroVadDetector, type VadProcess } from "../src/main/asr/silero-vad.js";

function completed(output: string): VadProcess {
  const stdout = new PassThrough(); const stderr = new PassThrough();
  const child = Object.assign(new EventEmitter(), { stdout, stderr, kill: vi.fn(() => true) }) as VadProcess;
  queueMicrotask(() => { stdout.end(output); stderr.end(); child.emit("close", 0, null); });
  return child;
}

describe("SileroVadDetector", () => {
  it("uses shell-free verified paths, merges short gaps and splits long spans", async () => {
    const spawnProcess = vi.fn(() => completed(JSON.stringify({ speech: [
      { startMs: -10, endMs: 30_000 }, { startMs: 30_200, endMs: 70_500 },
    ] })));
    const detector = new SileroVadDetector({ executablePath: "D:\\Viet Voice\\sherpa-onnx-vad.exe", modelPath: "D:\\Viet Voice\\silero_vad.onnx" }, { spawnProcess, timeoutMs: 1_000 });
    const intervals = await detector.detect("D:\\Nguồn video\\âm thanh.wav", 70_000);
    expect(spawnProcess).toHaveBeenCalledWith("D:\\Viet Voice\\sherpa-onnx-vad.exe", ["--silero-vad-model=D:\\Viet Voice\\silero_vad.onnx", "D:\\Nguồn video\\âm thanh.wav"], { shell: false, windowsHide: true });
    expect(intervals).toEqual([{ startMs: 0, endMs: 60_000 }, { startMs: 60_000, endMs: 70_000 }]);
  });

  it("rejects malformed output", async () => {
    const detector = new SileroVadDetector({ executablePath: "vad.exe", modelPath: "vad.onnx" }, { spawnProcess: () => completed("{"), timeoutMs: 1_000 });
    await expect(detector.detect("a.wav", 1_000)).rejects.toMatchObject({ code: "PARAFORMER_OUTPUT_INVALID" });
  });
});
