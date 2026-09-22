import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryProjectRepository } from "@vietvoice/database";
import { PairingManager } from "@vietvoice/agent-protocol";
import { createApi } from "../src/app.js";

describe("paired Agent AI gateway", () => {
  const apis: Array<ReturnType<typeof createApi>> = [];
  afterEach(async () => Promise.all(apis.splice(0).map((api) => api.close())));

  it("runs cloud AI for a paired Agent without returning provider credentials", async () => {
    const owner = randomUUID();
    const pairing = new PairingManager();
    const service = {
      recognize: vi.fn(async () => ({ text: "你好", segments: [{ startMs: 0, endMs: 900, text: "你好" }] })),
      translateSegments: vi.fn(async () => ["Xin chào"]),
      synthesizeVoice: vi.fn(async () => ({ audioBase64: "UklGRg==", mimeType: "audio/L16;rate=24000", durationMs: 900 })),
    };
    const api = createApi({ projects: new MemoryProjectRepository(), pairing, aiService: service, verifyToken: async () => ({ userId: owner }) });
    apis.push(api);
    const paired = await pairing.redeem(await pairing.issue(owner), { deviceId: randomUUID(), name: "Windows Agent" });
    const authorization = `Bearer ${paired.deviceToken}`;

    const recognized = await api.inject({ method: "POST", url: "/v1/agent/ai/recognize", headers: { authorization }, payload: { audioUrl: "https://files.example/audio.wav", language: "auto", provider: "gemini-audio" } });
    const translated = await api.inject({ method: "POST", url: "/v1/agent/ai/translate", headers: { authorization }, payload: { segments: [{ startMs: 0, endMs: 900, text: "你好" }] } });
    const voiced = await api.inject({ method: "POST", url: "/v1/agent/ai/voice", headers: { authorization }, payload: { text: "Xin chào", voice: "Kore" } });

    expect(recognized.json()).toEqual({ text: "你好", segments: [{ startMs: 0, endMs: 900, text: "你好" }] });
    expect(translated.json()).toEqual(["Xin chào"]);
    expect(voiced.json()).toMatchObject({ audioBase64: "UklGRg==", durationMs: 900 });
    expect(`${recognized.body}${translated.body}${voiced.body}`).not.toMatch(/api[_-]?key|secret/i);
  });

  it("rejects an unpaired caller", async () => {
    const api = createApi({ projects: new MemoryProjectRepository(), aiService: { recognize: vi.fn(), translateSegments: vi.fn(), synthesizeVoice: vi.fn() }, verifyToken: async () => null });
    apis.push(api);
    const response = await api.inject({ method: "POST", url: "/v1/agent/ai/translate", headers: { authorization: "Bearer invalid" }, payload: { segments: [{ startMs: 0, endMs: 1, text: "hello" }] } });
    expect(response.statusCode).toBe(401);
  });
});
