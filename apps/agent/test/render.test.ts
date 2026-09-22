import { describe, expect, it, vi } from "vitest";
import type { ProcessPlan } from "@vietvoice/media-core";
import { classifyFfmpegFailure, RenderError, runRecoverableRender } from "../src/main/jobs/render.js";

const plan: ProcessPlan = { executable: "ffmpeg", args: ["-i", "input.mp4", "partial.mp4"], shell: false, expectedDurationMs: 1_000 };

describe("recoverable render", () => {
  it("classifies disk exhaustion reported only on stderr", () => {
    expect(classifyFfmpegFailure("av_interleaved_write_frame(): No space left on device")).toBe("DISK_FULL");
  });

  it("removes only partial output after disk exhaustion and remains retryable", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(Object.assign(new Error("No space left"), { code: "ENOSPC" }));

    await expect(runRecoverableRender(plan, "partial.mp4", { execute, remove })).rejects.toMatchObject({ code: "DISK_FULL", retryable: true } satisfies Partial<RenderError>);
    expect(remove).toHaveBeenCalledWith("partial.mp4");
    expect(remove).not.toHaveBeenCalledWith("input.mp4");
  });

  it("never removes an export that existed before FFmpeg started", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(new Error("File 'partial.mp4' already exists. Exiting."));
    await expect(runRecoverableRender(plan, "partial.mp4", { execute, remove, outputExists: async () => true }))
      .rejects.toMatchObject({ code: "OUTPUT_EXISTS", retryable: false });
    expect(remove).not.toHaveBeenCalled();
  });
});
