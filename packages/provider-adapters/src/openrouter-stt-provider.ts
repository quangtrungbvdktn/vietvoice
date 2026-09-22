import { loadAudio, parseCloudTranscript, type CloudTranscript } from "./audio-response.js";
import type { Provider, ProviderResult } from "./types.js";

interface SpeechInput { audioUrl: string; language: "auto" | "zh" | "en" }
export class OpenRouterSttProvider implements Provider<CloudTranscript, SpeechInput> {
  readonly id = "openrouter-stt";
  constructor(private readonly endpoint: string, private readonly apiKey: string, private readonly model: string) {}
  async run(input: SpeechInput, signal: AbortSignal): Promise<ProviderResult<CloudTranscript>> {
    const audio = await loadAudio(input.audioUrl, signal);
    const prompt = `Transcribe this ${input.language} audio. Return only strict JSON with text and chronological segments containing integer startMs, endMs, text.`;
    const response = await fetch(this.endpoint, { method: "POST", headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" }, signal,
      body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "input_audio", input_audio: { data: audio.base64, format: audio.mimeType.includes("wav") ? "wav" : "mp3" } }] }] }) });
    if (!response.ok) throw new Error(response.status === 429 ? "PROVIDER_QUOTA" : "PROVIDER_ERROR");
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return { providerId: this.id, model: this.model, value: parseCloudTranscript(json.choices?.[0]?.message?.content ?? "") };
  }
}
