import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";
import type { AsrFailure } from "./types.js";

export interface VadProcess extends EventEmitter { stdout: Readable; stderr: Readable; kill(signal?: NodeJS.Signals): boolean }
interface VadPaths { executablePath: string; modelPath: string }
interface VadDependencies { spawnProcess(command: string, args: string[], options: { shell: false; windowsHide: true }): VadProcess; timeoutMs: number }
interface Interval { startMs: number; endMs: number }

export class SileroVadDetector {
  constructor(private readonly paths: VadPaths, private readonly dependencies: VadDependencies = {
    spawnProcess: (command, args, options) => spawn(command, args, options) as unknown as VadProcess, timeoutMs: 45_000,
  }) {}
  async detect(audioPath: string, durationMs: number, signal?: AbortSignal): Promise<Interval[]> {
    const child = this.dependencies.spawnProcess(this.paths.executablePath, [`--silero-vad-model=${this.paths.modelPath}`, audioPath], { shell: false, windowsHide: true });
    let output = ""; let timedOut = false; let aborted = signal?.aborted ?? false;
    child.stdout.on("data", (chunk) => { output += chunk.toString(); if (Buffer.byteLength(output) > 1024 * 1024) child.kill("SIGTERM"); });
    const abort = () => { aborted = true; child.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, this.dependencies.timeoutMs);
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); })
      .finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", abort); });
    if (aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    if (timedOut) throw failure("PARAFORMER_TIMEOUT");
    if (code !== 0) throw failure("PARAFORMER_START_FAILED");
    try {
      const parsed = JSON.parse(output) as { speech?: Interval[] };
      if (!Array.isArray(parsed.speech)) throw new Error();
      return split(merge(parsed.speech.map((item) => ({ startMs: clamp(item.startMs, 0, durationMs), endMs: clamp(item.endMs, 0, durationMs) }))));
    } catch { throw failure("PARAFORMER_OUTPUT_INVALID"); }
  }
}
function merge(items: Interval[]): Interval[] {
  const sorted = items.filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs > item.startMs).sort((a, b) => a.startMs - b.startMs);
  const result: Interval[] = [];
  for (const item of sorted) { const last = result.at(-1); if (last && item.startMs - last.endMs < 300) last.endMs = Math.max(last.endMs, item.endMs); else result.push({ ...item }); }
  return result;
}
function split(items: Interval[]): Interval[] { return items.flatMap((item) => { const out: Interval[] = []; for (let start = item.startMs; start < item.endMs; start += 60_000) out.push({ startMs: start, endMs: Math.min(start + 60_000, item.endMs) }); return out; }); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function failure(code: AsrFailure["code"]): AsrFailure { return Object.assign(new Error(code), { code, publicMessage: "Không thể phân đoạn giọng nói.", fallbackEligible: true }) as AsrFailure; }
