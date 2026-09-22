import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaProbeResult } from "../sources/probe-media.js";
import type { EdgeTtsInput, EdgeTtsResult } from "./edge-tts.js";
import type { StageExecution, StageRunner } from "./local-job-executor.js";
import type { AsrResult, LocalAsrInput } from "../asr/types.js";

interface Segment { startMs: number; endMs: number; text: string }
interface Transcript { text: string; segments: Segment[] }
interface VoiceFallback { audioBase64: string; mimeType: string; durationMs: number }
interface RenderInput { video: string; audio?: string; subtitles: string; output: string; durationMs: number }

export interface RealStageDependencies {
  workDirectory: string;
  sourceCatalog: { resolve(sourceId: string): Promise<string> };
  cloud: {
    translateSegments(segments: Segment[]): Promise<string[]>;
    synthesizeVoice(text: string, voice: string): Promise<VoiceFallback>;
  };
  asr: { recognize(input: LocalAsrInput): Promise<AsrResult> };
  probe(path: string): Promise<MediaProbeResult>;
  extractAudio(input: string, output: string, durationMs: number): Promise<void>;
  edgeVoice(input: EdgeTtsInput): Promise<EdgeTtsResult>;
  render(input: RenderInput): Promise<void>;
}

export function createRealStageRunner(dependencies: RealStageDependencies): StageRunner {
  return async (execution) => {
    const directory = join(dependencies.workDirectory, execution.job.id, sourceDirectory(execution.sourceId));
    await mkdir(directory, { recursive: true });
    switch (execution.stage) {
      case "video_input": return { path: await dependencies.sourceCatalog.resolve(execution.sourceId) };
      case "media_processing": {
        const input = requirePath(execution, "video_input");
        const media = await dependencies.probe(input);
        if (!media.durationMs) throw publicError("MEDIA_DURATION_UNKNOWN", "Không đọc được thời lượng video nguồn.");
        return { path: input, durationMs: media.durationMs, sizeBytes: media.sizeBytes };
      }
      case "audio_extraction": {
        const media = requireMedia(execution);
        const output = join(directory, "speech.wav");
        await dependencies.extractAudio(media.path, output, media.durationMs);
        return { path: output };
      }
      case "speech_recognition": {
        const audioPath = requirePath(execution, "audio_extraction");
        const audioSha256 = createHash("sha256").update(await readFile(audioPath)).digest("hex");
        return dependencies.asr.recognize({ audioPath, language: "auto", audioSha256 });
      }
      case "language_detection": {
        const transcript = requireTranscript(execution, "speech_recognition");
        return { language: /[\u3400-\u9fff]/u.test(transcript.text) ? "zh" : "en" };
      }
      case "transcript": return requireTranscript(execution, "speech_recognition");
      case "subtitle_generation": {
        const transcript = requireTranscript(execution, "transcript");
        const path = join(directory, "source.srt");
        await writeFile(path, toSrt(transcript.segments), "utf8");
        return { path };
      }
      case "translation": {
        const transcript = requireTranscript(execution, "transcript");
        const translated = await dependencies.cloud.translateSegments(transcript.segments);
        if (translated.length !== transcript.segments.length) throw publicError("TRANSLATION_SEGMENT_MISMATCH", "Bản dịch không khớp số đoạn phụ đề.");
        const segments = transcript.segments.map((segment, index) => ({ ...segment, text: translated[index]! }));
        const path = join(directory, "translated.srt");
        await writeFile(path, toSrt(segments), "utf8");
        return { text: translated.join("\n"), segments, path };
      }
      case "voice_generation": {
        const translation = requireTranslation(execution);
        const outputPath = join(directory, "voice.mp3");
        try {
          const voice = await dependencies.edgeVoice({ text: translation.text, voice: "vi-VN-HoaiMyNeural", outputPath });
          return { path: outputPath, durationMs: voice.durationMs, provider: "edge-tts" };
        } catch {
          const fallback = await dependencies.cloud.synthesizeVoice(translation.text, "Kore");
          const path = join(directory, "voice.wav");
          await writeFile(path, decodeGeminiAudio(fallback));
          return { path, durationMs: fallback.durationMs, provider: "gemini-tts" };
        }
      }
      case "audio_sync": return { path: requirePath(execution, "voice_generation") };
      case "video_rendering": {
        const media = requireMedia(execution);
        const output = join(directory, "rendered.mp4");
        const audio = execution.job.mode === "translate_dub" ? requirePath(execution, "audio_sync") : undefined;
        await dependencies.render({ video: media.path, ...(audio ? { audio } : {}), subtitles: requireTranslation(execution).path, output, durationMs: media.durationMs });
        return { path: output };
      }
      case "export": {
        const path = requirePath(execution, "video_rendering");
        return { path, sha256: createHash("sha256").update(await readFile(path)).digest("hex") };
      }
    }
  };
}

function sourceDirectory(sourceId: string): string { return createHash("sha256").update(sourceId).digest("hex").slice(0, 12); }
function artifact(execution: StageExecution, stage: Parameters<StageExecution["artifacts"]["get"]>[0]): unknown { return execution.artifacts.get(stage); }
function requirePath(execution: StageExecution, stage: Parameters<StageExecution["artifacts"]["get"]>[0]): string {
  const value = artifact(execution, stage);
  if (!value || typeof value !== "object" || !("path" in value) || typeof value.path !== "string") throw new Error(`STAGE_ARTIFACT_INVALID_${stage}`);
  return value.path;
}
function requireMedia(execution: StageExecution): { path: string; durationMs: number } {
  const value = artifact(execution, "media_processing");
  if (!value || typeof value !== "object" || !("path" in value) || !("durationMs" in value) || typeof value.path !== "string" || typeof value.durationMs !== "number") throw new Error("STAGE_ARTIFACT_INVALID_media_processing");
  return { path: value.path, durationMs: value.durationMs };
}
function requireTranscript(execution: StageExecution, stage: "speech_recognition" | "transcript"): Transcript {
  const value = artifact(execution, stage) as Partial<Transcript> | undefined;
  if (!value || typeof value.text !== "string" || !Array.isArray(value.segments)) throw new Error(`STAGE_ARTIFACT_INVALID_${stage}`);
  return { text: value.text, segments: value.segments } as Transcript;
}
function requireTranslation(execution: StageExecution): { text: string; path: string } {
  const value = artifact(execution, "translation") as { text?: unknown; path?: unknown } | undefined;
  if (!value || typeof value.text !== "string" || typeof value.path !== "string") throw new Error("STAGE_ARTIFACT_INVALID_translation");
  return { text: value.text, path: value.path };
}
function toSrt(segments: Segment[]): string { return segments.map((segment, index) => `${index + 1}\n${timestamp(segment.startMs)} --> ${timestamp(segment.endMs)}\n${segment.text.trim()}\n`).join("\n"); }
function timestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
  const seconds = Math.floor(milliseconds % 60_000 / 1_000);
  const millis = Math.max(0, Math.floor(milliseconds % 1_000));
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${String(millis).padStart(3, "0")}`;
}
function pad(value: number): string { return String(value).padStart(2, "0"); }
function decodeGeminiAudio(voice: VoiceFallback): Buffer {
  const pcm = Buffer.from(voice.audioBase64, "base64");
  if (!/audio\/(?:L16|pcm)/i.test(voice.mimeType)) return pcm;
  const rate = Number(voice.mimeType.match(/rate=(\d+)/i)?.[1] ?? 24_000);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
function publicError(code: string, publicMessage: string): Error { return Object.assign(new Error(code), { code, publicMessage }); }
