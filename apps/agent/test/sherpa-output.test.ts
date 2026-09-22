import { describe, expect, it } from "vitest";
import { parseSherpaOutput } from "../src/main/asr/sherpa-output.js";

describe("parseSherpaOutput", () => {
  it("normalizes Chinese token timestamps relative to the VAD chunk", () => {
    const transcript = parseSherpaOutput(JSON.stringify({
      text: "你好世界",
      tokens: ["你", "好", "世", "界"],
      timestamps: [0, 0.2, 0.4, 0.6],
    }), { chunkStartMs: 2_000, chunkEndMs: 3_000 });

    expect(transcript).toEqual({
      text: "你好世界",
      segments: [
        { startMs: 2_000, endMs: 2_200, text: "你" },
        { startMs: 2_200, endMs: 2_400, text: "好" },
        { startMs: 2_400, endMs: 2_600, text: "世" },
        { startMs: 2_600, endMs: 3_000, text: "界" },
      ],
    });
  });

  it("extracts the final complete JSON object from diagnostic output", () => {
    const transcript = parseSherpaOutput([
      "Loading model...",
      '{"text":"旧","tokens":["旧"],"timestamps":[0]}',
      "Recognized:",
      '{"text":"你好","tokens":["你","好"],"timestamps":[0,0.5]}',
    ].join("\n"), { chunkStartMs: 0, chunkEndMs: 1_000 });

    expect(transcript.text).toBe("你好");
    expect(transcript.segments).toEqual([
      { startMs: 0, endMs: 500, text: "你" },
      { startMs: 500, endMs: 1_000, text: "好" },
    ]);
  });

  it("normalizes mixed tokens into monotonic segments", () => {
    const transcript = parseSherpaOutput(JSON.stringify({
      text: "你好 OpenAI",
      tokens: ["你", "好", " OpenAI"],
      timestamps: [0, 0.42, 0.39],
    }), { chunkStartMs: 1_000, chunkEndMs: 3_000 });

    expect(transcript.text).toBe("你好 OpenAI");
    expect(transcript.segments[0]).toMatchObject({ startMs: 1_000 });
    expect(transcript.segments.every((segment, index, all) =>
      segment.endMs > segment.startMs && (!index || segment.startMs >= all[index - 1]!.endMs),
    )).toBe(true);
  });

  it("clamps negative timestamps and gives the final token positive duration", () => {
    const transcript = parseSherpaOutput(JSON.stringify({
      text: "测试",
      tokens: ["测", "试"],
      timestamps: [-1, 1],
    }), { chunkStartMs: 500, chunkEndMs: 1_500 });

    expect(transcript.segments).toEqual([
      { startMs: 500, endMs: 1_480, text: "测" },
      { startMs: 1_480, endMs: 1_500, text: "试" },
    ]);
  });

  it("uses a coarse VAD segment when token timestamps are absent", () => {
    expect(parseSherpaOutput('{"text":"只有文本"}', { chunkStartMs: 750, chunkEndMs: 2_000 }))
      .toEqual({ text: "只有文本", segments: [{ startMs: 750, endMs: 2_000, text: "只有文本" }] });
  });

  it.each(["{", "{}", '{"text":"","tokens":[],"timestamps":[]}'])(
    "rejects invalid output %s",
    (raw) => expect(() => parseSherpaOutput(raw, { chunkStartMs: 0, chunkEndMs: 2_000 }))
      .toThrowError(/PARAFORMER_OUTPUT_INVALID/),
  );

  it("rejects output larger than four MiB", () => {
    const raw = JSON.stringify({ text: "中".repeat(4 * 1024 * 1024), tokens: [], timestamps: [] });
    expect(() => parseSherpaOutput(raw, { chunkStartMs: 0, chunkEndMs: 2_000 }))
      .toThrowError(/PARAFORMER_OUTPUT_INVALID/);
  });

  it("rejects invalid chunk bounds", () => {
    expect(() => parseSherpaOutput('{"text":"你好"}', { chunkStartMs: 2_000, chunkEndMs: 1_000 }))
      .toThrowError(/PARAFORMER_OUTPUT_INVALID/);
  });
});
