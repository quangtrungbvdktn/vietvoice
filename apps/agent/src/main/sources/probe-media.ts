import { spawn } from "node:child_process";

export interface MediaProbeResult { durationMs: number | null; sizeBytes: number }

export async function probeMedia(path: string, signal?: AbortSignal): Promise<MediaProbeResult> {
  const output = await collectProcess("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", path], signal);
  const parsed = JSON.parse(output) as { format?: { duration?: string; size?: string } };
  const duration = Number(parsed.format?.duration);
  const size = Number(parsed.format?.size);
  return { durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null, sizeBytes: Number.isFinite(size) ? size : 0 };
}

export function collectProcess(command: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, signal });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with code ${code}`)));
  });
}
