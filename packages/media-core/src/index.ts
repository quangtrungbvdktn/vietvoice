import type { ExportProfile } from "@vietvoice/contracts";

export interface ProcessPlan { executable: "ffmpeg"; args: string[]; shell: false; expectedDurationMs: number }
const sizes = { vertical: "1080:1920", square: "1080:1080", landscape: "1920:1080", short_form: "1080:1920" } as const;

export function buildRenderPlan(input: { video: string; audio?: string; subtitles?: string; output: string; durationMs: number }, profile: ExportProfile): ProcessPlan {
  const args = ["-n", "-i", input.video];
  if (input.audio) args.push("-i", input.audio);
  const videoFilters: string[] = [];
  const complexFilters: string[] = [];
  let mappedVideo: string | undefined;
  if (profile.preset !== "original") {
    const size = sizes[profile.preset];
    if (profile.frameMode === "fit_blur") {
      complexFilters.push(
        `[0:v]split=2[bg][fg];[bg]scale=${size}:force_original_aspect_ratio=increase,crop=${size},boxblur=20[blurred];[fg]scale=${size}:force_original_aspect_ratio=decrease[foreground];[blurred][foreground]overlay=(W-w)/2:(H-h)/2[vfit]`,
      );
      mappedVideo = "[vfit]";
    } else {
      videoFilters.push(profile.frameMode === "crop"
        ? `scale=${size}:force_original_aspect_ratio=increase,crop=${size}`
        : `scale=${size}:force_original_aspect_ratio=decrease,pad=${size}:(ow-iw)/2:(oh-ih)/2`);
    }
  }
  if (input.subtitles) {
    const subtitleFilter = `subtitles=${escapeFilter(input.subtitles)}`;
    if (mappedVideo) {
      complexFilters.push(`${mappedVideo}${subtitleFilter}[vout]`);
      mappedVideo = "[vout]";
    } else {
      videoFilters.push(subtitleFilter);
    }
  }
  if (input.audio) {
    complexFilters.push("[0:a][1:a]sidechaincompress=threshold=0.04:ratio=8[ducked];[ducked][1:a]amix=inputs=2:duration=first[aout]");
  }
  if (videoFilters.length) args.push("-vf", videoFilters.join(","));
  if (complexFilters.length) args.push("-filter_complex", complexFilters.join(";"));
  if (mappedVideo) args.push("-map", mappedVideo);
  else if (input.audio) args.push("-map", "0:v");
  if (input.audio) args.push("-map", "[aout]");
  else if (mappedVideo) args.push("-map", "0:a?");
  const quality = profile.quality === "high" ? ["slow", "18"] : profile.quality === "economy" ? ["fast", "28"] : ["medium", "23"];
  args.push("-c:v", "libx264", "-preset", quality[0]!, "-crf", quality[1]!, "-progress", "pipe:1", input.output);
  return { executable: "ffmpeg", args, shell: false, expectedDurationMs: input.durationMs };
}

export function buildAudioExtractPlan(input: string, output: string, durationMs: number): ProcessPlan {
  return { executable: "ffmpeg", args: ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output], shell: false, expectedDurationMs: durationMs };
}

function escapeFilter(value: string) { return value.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "\\'"); }
export function parseFfmpegProgress(line: string, total: number) { const match = line.match(/^out_time_ms=(\d+)/); if (!match) return null; return { progress: Math.min(100, Math.round(Number(match[1]) / 1000 / total * 100)) }; }
export class CleanupManifest { private refs = new Map<string, number>(); retain(path: string) { this.refs.set(path, (this.refs.get(path) ?? 0) + 1); } release(path: string) { this.refs.set(path, Math.max(0, (this.refs.get(path) ?? 0) - 1)); } canDelete(path: string) { return (this.refs.get(path) ?? 0) === 0; } }
