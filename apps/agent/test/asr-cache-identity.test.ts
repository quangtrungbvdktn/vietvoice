import { describe, expect, it } from "vitest";
import { createAsrCacheIdentity } from "../src/main/asr/asr-cache-identity.js";

const base = {
  audioSha256: "a".repeat(64), runtimeVersion: "1.13.8", modelSha256: "b".repeat(64),
  tokensSha256: "c".repeat(64), vadModelSha256: "d".repeat(64), vadConfig: { threshold: 0.5 },
  language: "auto" as const, threads: 4, stageVersion: 1,
};

describe("createAsrCacheIdentity", () => {
  it.each(["audioSha256", "runtimeVersion", "modelSha256", "tokensSha256", "vadModelSha256", "language", "threads", "stageVersion"] as const)(
    "changes when %s changes", (key) => expect(createAsrCacheIdentity({ ...base, [key]: key === "threads" ? 8 : key === "stageVersion" ? 2 : "changed" } as typeof base))
      .not.toBe(createAsrCacheIdentity(base)),
  );
  it("changes when VAD configuration changes", () => {
    expect(createAsrCacheIdentity({ ...base, vadConfig: { threshold: 0.7 } })).not.toBe(createAsrCacheIdentity(base));
  });
  it("ignores settings outside recognition", () => {
    expect(createAsrCacheIdentity({ ...base, translation: "Gemini", voice: "HoaiMy", subtitleStyle: "bold", exportProfile: "vertical" }))
      .toBe(createAsrCacheIdentity(base));
  });
});
