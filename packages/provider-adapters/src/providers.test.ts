import { afterEach, describe, expect, it, vi } from "vitest";
import { createProviderRegistry } from "./providers.js";

describe("provider registry", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("registers only providers whose optional keys are configured", () => {
    expect([...createProviderRegistry({}).keys()]).toEqual(["edge-tts"]);
    expect([...createProviderRegistry({ geminiApiKey: "g" }).keys()]).toEqual(["gemini-audio", "gemini", "edge-tts", "gemini-tts"]);
    expect([...createProviderRegistry({ openRouterApiKey: "o", openRouterAsrModel: "google/gemini-2.5-flash" }).keys()]).toEqual(["openrouter-stt", "openrouter", "edge-tts"]);
  });
  it("sends audio inline to Gemini and parses strict timestamp JSON", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(Buffer.from("wav"), { status: 200, headers: { "content-type": "audio/wav" } })).mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"text":"你好","segments":[{"startMs":0,"endMs":500,"text":"你好"}]}\n```' }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createProviderRegistry({ geminiApiKey: "secret" }).get("gemini-audio")!;
    await expect(provider.run({ audioUrl: "https://files.example/a.wav", language: "zh" }, new AbortController().signal)).resolves.toMatchObject({ value: { text: "你好" } });
    const body = JSON.parse(String((request.mock.calls[1]![1] as RequestInit).body));
    expect(body.contents[0].parts).toEqual(expect.arrayContaining([expect.objectContaining({ inlineData: { mimeType: "audio/wav", data: Buffer.from("wav").toString("base64") } })]));
  });
  it("sends supported audio content and configured model to OpenRouter", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(Buffer.from("wav"), { status: 200, headers: { "content-type": "audio/wav" } })).mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"text":"Hello","segments":[{"startMs":0,"endMs":400,"text":"Hello"}]}' } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createProviderRegistry({ openRouterApiKey: "secret", openRouterAsrModel: "google/gemini-2.5-flash" }).get("openrouter-stt")!;
    await expect(provider.run({ audioUrl: "https://files.example/a.wav", language: "en" }, new AbortController().signal)).resolves.toMatchObject({ value: { text: "Hello" } });
    const body = JSON.parse(String((request.mock.calls[1]![1] as RequestInit).body));
    expect(body).toMatchObject({ model: "google/gemini-2.5-flash", messages: expect.any(Array) });
  });
  it("rejects an empty transcript response", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(Buffer.from("wav"), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"text":"","segments":[]}' }] } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const provider = createProviderRegistry({ geminiApiKey: "secret" }).get("gemini-audio")!;
    await expect(provider.run({ audioUrl: "https://files.example/a.wav", language: "auto" }, new AbortController().signal)).rejects.toThrow("PROVIDER_RESPONSE_INVALID");
  });
});
