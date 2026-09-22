import { describe, expect, it, vi } from "vitest";
import { ProviderRouter } from "@vietvoice/provider-adapters";
import { detectLanguage, generateVoice, recognize, recognizeDetected, translate } from "../src/stages/ai.js";

describe("AI stages", () => {
  it("requires an editable decision for silence or low-confidence openings", () => {
    expect(detectLanguage(0.2, "zh")).toEqual({ status: "needs_review", choices: ["zh", "en"] });
  });
  it("does not call a billable recognizer while language requires review", async()=>{const provider={id:"gemini-audio",run:vi.fn()};const router=new ProviderRouter(new Map([[provider.id,provider]]));await expect(recognizeDetected(router,{audioUrl:"silent.wav",detectedLanguage:"zh",confidence:.2,provider:"gemini-audio"})).resolves.toEqual({status:"needs_review",choices:["zh","en"]});expect(provider.run).not.toHaveBeenCalled();});

  it("routes Chinese, translation, and voice through primary providers", async () => {
    const ids: string[] = [];
    const provider = (id: string) => ({ id, run: vi.fn(async () => { ids.push(id); return { providerId: id, model: "test", value: {} }; }) });
    const router = new ProviderRouter(new Map(["gemini-audio", "gemini", "edge-tts"].map((id) => [id, provider(id)])));

    await recognize(router, { audioUrl: "audio.wav", language: "zh", provider: "gemini-audio" });
    await translate(router, { text: "你好" });
    await generateVoice(router, { text: "xin chào", voice: "vi-VN-HoaiMyNeural" });
    expect(ids).toEqual(["gemini-audio", "gemini", "edge-tts"]);
  });
});
