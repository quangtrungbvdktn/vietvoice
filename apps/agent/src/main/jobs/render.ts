import { spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import type { ProcessPlan } from "@vietvoice/media-core";

export class RenderError extends Error {
  constructor(public readonly code: "DISK_FULL" | "OUTPUT_EXISTS" | "RENDER_FAILED", public readonly retryable: boolean, cause?: unknown) {
    super(code, { cause });
  }
}

export function executePlan(plan: ProcessPlan, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(plan.executable, plan.args, { shell: false, windowsHide: true, signal });
    let stderr = "";
    process.stdout?.resume();
    process.stderr?.on("data", (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-64 * 1024);
    });
    process.once("error", reject);
    process.once("close", (code) => {
      if (code === 0) return resolve();
      const error = Object.assign(new Error(stderr.trim() || `FFMPEG_${code}`), {
        code: classifyFfmpegFailure(stderr) === "DISK_FULL" ? "ENOSPC" : "FFMPEG_FAILED",
      });
      reject(error);
    });
  });
}

export function classifyFfmpegFailure(stderr: string): "DISK_FULL" | "RENDER_FAILED" {
  return /no space left|not enough space|disk full|enospc/i.test(stderr) ? "DISK_FULL" : "RENDER_FAILED";
}

export async function runRecoverableRender(
  plan: ProcessPlan,
  outputPath: string,
  dependencies: { execute(plan: ProcessPlan): Promise<void>; remove(path: string): Promise<void>; outputExists?: (path: string) => Promise<boolean> } = {
    execute: executePlan,
    remove: (path) => rm(path, { force: true }),
    outputExists: async (path) => access(path).then(() => true, () => false),
  },
): Promise<void> {
  const outputExisted = await (dependencies.outputExists ?? (async (path) => access(path).then(() => true, () => false)))(outputPath);
  if (outputExisted) throw new RenderError("OUTPUT_EXISTS", false);
  try {
    await dependencies.execute(plan);
  } catch (error) {
    const outputConflict = error instanceof Error && /already exists|not overwrite/i.test(error.message);
    if (!outputConflict) await dependencies.remove(outputPath);
    if (outputConflict) throw new RenderError("OUTPUT_EXISTS", false, error);
    const diskFull = error instanceof Error && ("code" in error && error.code === "ENOSPC" || /no space/i.test(error.message));
    throw new RenderError(diskFull ? "DISK_FULL" : "RENDER_FAILED", true, error);
  }
}
