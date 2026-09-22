import { describe, expect, it } from "vitest";
import { CleanupManifest, buildAudioExtractPlan, buildRenderPlan, parseFfmpegProgress } from "./index.js";

const base = { resolution: "1080p", quality: "balanced", frameMode: "crop" } as const;

describe("media plans", () => {
  it.each(["original", "vertical", "square", "landscape", "short_form"] as const)("builds %s without shell interpolation", (preset) => {
    const plan = buildRenderPlan({ video: "input; rm.mp4", output: "out.mp4", durationMs: 1_000 }, { ...base, preset });
    expect(plan.executable).toBe("ffmpeg");
    expect(plan.shell).toBe(false);
    expect(plan.args).toContain("input; rm.mp4");
  });

  it("mixes dubbed audio and burns subtitles while retaining background audio", () => {
    const plan = buildRenderPlan({ video: "input.mp4", audio: "voice.mp3", subtitles: "translated.ass", output: "out.mp4", durationMs: 60_000 }, { ...base, preset: "vertical" });
    expect(plan.args.join(" ")).toContain("sidechaincompress");
    expect(plan.args.join(" ")).toContain("subtitles=translated.ass");
    expect(plan.args).toContain("-filter_complex");
  });

  it("never overwrites a completed export implicitly", () => {
    const plan = buildRenderPlan({ video: "input.mp4", output: "out.mp4", durationMs: 1_000 }, { ...base, preset: "original" });
    expect(plan.args).toContain("-n");
    expect(plan.args).not.toContain("-y");
  });

  it("builds a blurred background when fitting portrait content", () => {
    const plan = buildRenderPlan(
      { video: "input.mp4", output: "out.mp4", durationMs: 1_000 },
      { ...base, preset: "landscape", frameMode: "fit_blur" },
    );
    expect(plan.args.join(" ")).toContain("boxblur");
    expect(plan.args.join(" ")).toContain("overlay");
    expect(plan.args).toContain("-filter_complex");
    expect(plan.args).toEqual(expect.arrayContaining(["-map", "0:a?"]));
  });

  it("parses FFmpeg microsecond progress", () => expect(parseFfmpegProgress("out_time_ms=500000", 1_000)).toEqual({ progress: 50 }));

  it("deletes only unreferenced temporary artifacts", () => {
    const manifest = new CleanupManifest();
    manifest.retain("voice.wav");
    expect(manifest.canDelete("voice.wav")).toBe(false);
    manifest.release("voice.wav");
    expect(manifest.canDelete("voice.wav")).toBe(true);
  });

  it("extracts compressed cloud-friendly mono speech audio for long videos", () => {
    const plan = buildAudioExtractPlan("episode.mp4", "speech.wav", 90_000);
    expect(plan.args).toEqual(expect.arrayContaining(["-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "speech.wav"]));
    expect(plan.shell).toBe(false);
  });
});
