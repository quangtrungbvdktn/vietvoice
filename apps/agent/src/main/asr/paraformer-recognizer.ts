import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Readable } from "node:stream";
import { parseSherpaOutput } from "./sherpa-output.js";
import type { AsrFailure, LocalAsrInput, Transcript } from "./types.js";
import type { VerifiedParaformer } from "./paraformer-manifest.js";

export interface SpawnedProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals): boolean;
}

interface Bounds { chunkStartMs: number; chunkEndMs: number }
interface RecognizerDependencies {
  spawnProcess(command: string, args: string[], options: { shell: false; windowsHide: true }): SpawnedProcess;
  threads: number;
  timeoutMs: number;
}

export class ParaformerRecognizer {
  constructor(private readonly paths: VerifiedParaformer, private readonly dependencies: RecognizerDependencies = {
    spawnProcess: (command, args, options) => spawn(command, args, options) as unknown as SpawnedProcess,
    threads: 4, timeoutMs: 45_000,
  }) {}

  async recognize(input: LocalAsrInput, bounds: Bounds, signal?: AbortSignal): Promise<Transcript> {
    let child: SpawnedProcess;
    try {
      child = this.dependencies.spawnProcess(this.paths.executablePath, [
        `--tokens=${this.paths.tokensPath}`,
        `--paraformer=${this.paths.modelPath}`,
        `--num-threads=${this.dependencies.threads}`,
        input.audioPath,
      ], { shell: false, windowsHide: true });
    } catch {
      throw failure("PARAFORMER_START_FAILED", "Không thể khởi động Paraformer.");
    }

    let stdout = "";
    let stderrBytes = 0;
    let timedOut = false;
    let aborted = signal?.aborted ?? false;
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
      if (Buffer.byteLength(stdout) > 4 * 1024 * 1024) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > 64 * 1024) child.kill("SIGTERM");
    });
    const onAbort = () => { aborted = true; child.kill("SIGTERM"); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, this.dependencies.timeoutMs);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }).catch(() => { throw failure("PARAFORMER_START_FAILED", "Không thể khởi động Paraformer."); })
      .finally(() => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); });

    if (aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    if (timedOut) throw failure("PARAFORMER_TIMEOUT", "Paraformer xử lý quá thời gian cho phép.");
    if (exitCode !== 0) throw failure("PARAFORMER_START_FAILED", "Paraformer kết thúc không thành công.");
    try {
      return parseSherpaOutput(stdout, bounds);
    } catch {
      throw failure("PARAFORMER_OUTPUT_INVALID", "Kết quả nhận dạng Paraformer không hợp lệ.");
    }
  }
}

function failure(code: AsrFailure["code"], publicMessage: string): AsrFailure {
  return Object.assign(new Error(code), { code, publicMessage, fallbackEligible: true }) as AsrFailure;
}
