import { describe, expect, it, vi } from "vitest";
import { ProviderRouter } from "@vietvoice/provider-adapters";
import { ProviderAgentAiService } from "../src/ai/provider-ai-service.js";

describe("provider-backed Agent AI service", () => {
  it("uses only the explicitly requested ASR fallback and preserves translation fallback", async () => {
    const calls: string[] = [];
    const providers = new Map<string, any>([
      ["gemini-audio", { id: "gemini-audio", run: vi.fn(async () => ({ providerId: "gemini-audio", model: "gemini", value: { text: "你好", segments: [{ startMs: 0, endMs: 500, text: "你好" }] } })) }],
      ["gemini", { id: "gemini", run: vi.fn(async () => { calls.push("gemini"); throw new Error("PROVIDER_QUOTA"); }) }],
      ["openrouter", { id: "openrouter", run: vi.fn(async (input: { text: string }) => { calls.push("openrouter"); return { providerId: "openrouter", model: "free", value: input.text === "你好" ? "Xin chào" : "Tạm biệt" }; }) }],
    ]);
    const service = new ProviderAgentAiService(new ProviderRouter(providers), { timeoutMs: 45_000, retries: 1 });

    await expect(service.recognize({ audioUrl: "https://files.example/a.wav", language: "auto", provider: "gemini-audio" })).resolves.toMatchObject({ text: "你好" });
    await expect(service.translateSegments([
      { startMs: 0, endMs: 500, text: "你好" },
      { startMs: 500, endMs: 1000, text: "再见" },
    ])).resolves.toEqual(["Xin chào", "Tạm biệt"]);
    expect(calls).toEqual(["gemini", "gemini", "openrouter", "gemini", "gemini", "openrouter"]);
  });

  it("returns Gemini PCM without exposing the provider data URL contract", async () => {
    const audio = Buffer.from("pcm-audio").toString("base64");
    const provider = { id: "gemini-tts", run: vi.fn(async () => ({ providerId: "gemini-tts", model: "tts", value: { audioUrl: `data:audio/L16;rate=24000;base64,${audio}`, durationMs: 200 } })) };
    const service = new ProviderAgentAiService(new ProviderRouter(new Map([[provider.id, provider]])), { timeoutMs: 45_000, retries: 1 });

    await expect(service.synthesizeVoice({ text: "Xin chào", voice: "Kore" })).resolves.toEqual({
      audioBase64: audio, mimeType: "audio/L16;rate=24000", durationMs: 200,
    });
  });
});
