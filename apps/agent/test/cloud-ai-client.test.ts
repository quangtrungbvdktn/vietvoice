import { describe, expect, it, vi } from "vitest";
import { CloudAiClient } from "../src/main/cloud-ai-client.js";

describe("Agent cloud AI client", () => {
  it("uploads local speech audio before requesting cloud recognition", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ audioUrl: "https://api.example/v1/agent/assets/random-token" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "你好", segments: [{ startMs: 0, endMs: 500, text: "你好" }] }), { status: 200 }));
    const readAudio = vi.fn(async () => Buffer.from("audio-bytes"));
    const client = new CloudAiClient({ apiUrl: "https://api.example", deviceToken: "device-token" }, { request, readAudio });

    await expect(client.recognizeFallback("D:\\Jobs\\speech.wav", "auto", "gemini-audio")).resolves.toMatchObject({ text: "你好" });
    expect(request.mock.calls[0]?.[0]).toBe("https://api.example/v1/agent/assets");
    expect(request.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: Buffer.from("audio-bytes") });
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ audioUrl: "https://api.example/v1/agent/assets/random-token", language: "auto", provider: "gemini-audio" }),
    });
    expect(JSON.stringify(request.mock.calls)).not.toContain("api-key");
  });

  it("reuses one uploaded asset when falling back from Gemini to OpenRouter", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ audioUrl: "https://api.example/asset/one" }), { status: 201 }))
      .mockResolvedValueOnce(new Response("quota", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "你好", segments: [] }), { status: 200 }));
    const readAudio = vi.fn(async () => Buffer.from("audio"));
    const client = new CloudAiClient({ apiUrl: "https://api.example", deviceToken: "token" }, { request, readAudio });
    await expect(client.recognizeFallback("speech.wav", "zh", "gemini-audio")).rejects.toMatchObject({ code: "CLOUD_AI_FAILED" });
    await expect(client.recognizeFallback("speech.wav", "zh", "openrouter-stt")).resolves.toMatchObject({ text: "你好" });
    expect(readAudio).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("sends translation and Gemini voice requests through the paired API", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Xin chào"]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ audioBase64: "UklGRg==", mimeType: "audio/L16;rate=24000", durationMs: 500 }), { status: 200 }));
    const client = new CloudAiClient({ apiUrl: "https://api.example/", deviceToken: "device-token" }, { request, readAudio: vi.fn() });
    const segments = [{ startMs: 0, endMs: 500, text: "你好" }];

    await expect(client.translateSegments(segments)).resolves.toEqual(["Xin chào"]);
    await expect(client.synthesizeVoice("Xin chào", "Kore")).resolves.toMatchObject({ durationMs: 500 });
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example/v1/agent/ai/translate", "https://api.example/v1/agent/ai/voice",
    ]);
  });
});
