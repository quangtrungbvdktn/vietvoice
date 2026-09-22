import { describe, expect, it } from "vitest";

import {
  ExportProfileSchema,
  QueueSettingsSchema,
  StageNameSchema,
} from "./index.js";

describe("shared contracts", () => {
  it("accepts a canonical pipeline stage and rejects unknown stages", () => {
    expect(StageNameSchema.parse("speech_recognition")).toBe(
      "speech_recognition",
    );
    expect(() => StageNameSchema.parse("speaker_diarization")).toThrow();
  });

  it("limits queue concurrency to three independent workers", () => {
    expect(() => QueueSettingsSchema.parse({ concurrency: 4 })).toThrow();
    expect(QueueSettingsSchema.parse({ concurrency: 2 })).toEqual({
      concurrency: 2,
    });
  });

  it("normalizes a vertical export without mixing queue settings into it", () => {
    expect(
      ExportProfileSchema.parse({
        preset: "vertical",
        resolution: "1080p",
        quality: "balanced",
        frameMode: "fit_blur",
      }),
    ).toEqual({
      preset: "vertical",
      resolution: "1080p",
      quality: "balanced",
      frameMode: "fit_blur",
    });
  });
});
