import { describe, expect, it, vi } from "vitest";
import { synthesizeEdgeVoice } from "../src/main/jobs/edge-tts.js";

describe("Edge TTS synthesis", () => {
  it("passes user text as an argument without invoking a shell", async () => {
    const launch = vi.fn().mockResolvedValue({ stderr: "" });
    const probeDuration = vi.fn().mockResolvedValue(3_250);
    const outputPath = "D:\\VietVoice\\jobs\\job-1\\voice.mp3";

    await expect(synthesizeEdgeVoice({
      text: "Xin chào & del C:\\*.*",
      voice: "vi-VN-HoaiMyNeural",
      outputPath,
    }, { launch, probeDuration })).resolves.toEqual({
      audioUrl: "file:///D:/VietVoice/jobs/job-1/voice.mp3",
      durationMs: 3_250,
    });

    expect(launch).toHaveBeenCalledWith(expect.objectContaining({
      executable: "edge-tts",
      args: [
        "--voice", "vi-VN-HoaiMyNeural",
        "--text", "Xin chào & del C:\\*.*",
        "--write-media", outputPath,
      ],
      shell: false,
    }));
  });

  it("maps a missing executable to an actionable retryable error", async () => {
    const launch = vi.fn().mockRejectedValue(Object.assign(new Error("spawn edge-tts ENOENT"), { code: "ENOENT" }));
    await expect(synthesizeEdgeVoice({ text: "Xin chào", voice: "vi-VN-HoaiMyNeural", outputPath: "voice.mp3" }, {
      launch,
      probeDuration: vi.fn(),
    })).rejects.toMatchObject({ code: "EDGE_TTS_NOT_INSTALLED", retryable: true });
  });

  it("rejects empty text before launching a process", async () => {
    const launch = vi.fn();
    await expect(synthesizeEdgeVoice({ text: "   ", voice: "vi-VN-HoaiMyNeural", outputPath: "voice.mp3" }, {
      launch,
      probeDuration: vi.fn(),
    })).rejects.toMatchObject({ code: "EDGE_TTS_INVALID_INPUT", retryable: false });
    expect(launch).not.toHaveBeenCalled();
  });
});
