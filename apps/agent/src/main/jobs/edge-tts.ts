import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export interface EdgeTtsInput {
  text: string;
  voice: string;
  outputPath: string;
  rate?: string;
  volume?: string;
  pitch?: string;
}

export interface EdgeTtsProcessPlan {
  executable: string;
  args: string[];
  shell: false;
}

export interface EdgeTtsResult { audioUrl: string; durationMs: number }

export class EdgeTtsError extends Error {
  constructor(
    message: string,
    readonly code: "EDGE_TTS_INVALID_INPUT" | "EDGE_TTS_NOT_INSTALLED" | "EDGE_TTS_FAILED",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EdgeTtsError";
  }
}

export interface EdgeTtsDependencies {
  launch(plan: EdgeTtsProcessPlan): Promise<{ stderr: string }>;
  probeDuration(path: string): Promise<number>;
}

export async function synthesizeEdgeVoice(input: EdgeTtsInput, dependencies: EdgeTtsDependencies): Promise<EdgeTtsResult> {
  if (!input.text.trim() || !input.voice.trim() || !input.outputPath.trim()) {
    throw new EdgeTtsError("Nội dung, giọng đọc và đường dẫn đầu ra không được để trống.", "EDGE_TTS_INVALID_INPUT", false);
  }

  const args = ["--voice", input.voice, "--text", input.text, "--write-media", input.outputPath];
  if (input.rate) args.push(`--rate=${input.rate}`);
  if (input.volume) args.push(`--volume=${input.volume}`);
  if (input.pitch) args.push(`--pitch=${input.pitch}`);

  try {
    const result = await dependencies.launch({ executable: "edge-tts", args, shell: false });
    const durationMs = await dependencies.probeDuration(input.outputPath);
    return { audioUrl: localFileUrl(input.outputPath), durationMs };
  } catch (error) {
    if (isMissingExecutable(error)) {
      throw new EdgeTtsError("Chưa tìm thấy Edge TTS trên máy. Hãy cài hoặc khôi phục thành phần Edge TTS rồi thử lại.", "EDGE_TTS_NOT_INSTALLED", true);
    }
    if (error instanceof EdgeTtsError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new EdgeTtsError(`Edge TTS không tạo được giọng đọc: ${detail}`, "EDGE_TTS_FAILED", true);
  }
}

export function launchEdgeTts(plan: EdgeTtsProcessPlan): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.executable, plan.args, { shell: plan.shell, windowsHide: true });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-16_384); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve({ stderr })
      : reject(new Error(stderr.trim() || `edge-tts exited with code ${code ?? "unknown"}`)));
  });
}

function isMissingExecutable(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function localFileUrl(path: string): string {
  if (/^[a-z]:\\/i.test(path)) return new URL(`file:///${path.replaceAll("\\", "/")}`).href;
  return pathToFileURL(path).href;
}
