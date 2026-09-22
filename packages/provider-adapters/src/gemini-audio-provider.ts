import { loadAudio, parseCloudTranscript, type CloudTranscript } from "./audio-response.js";
import type { Provider, ProviderResult } from "./types.js";

interface SpeechInput { audioUrl: string; language: "auto" | "zh" | "en" }
const instruction = "Transcribe the audio exactly. Return only JSON: {\"text\":\"...\",\"segments\":[{\"startMs\":0,\"endMs\":1000,\"text\":\"...\"}]}. Use integer millisecond timestamps in chronological order.";

export class GeminiAudioProvider implements Provider<CloudTranscript, SpeechInput> {
  readonly id = "gemini-audio";
  constructor(private readonly endpoint: string, private readonly apiKey: string, private readonly model = "gemini-2.5-flash") {}
  async run(input: SpeechInput, signal: AbortSignal): Promise<ProviderResult<CloudTranscript>> {
    const audio = await loadAudio(input.audioUrl, signal);
    const response = await fetch(this.endpoint, { method: "POST", headers: { "x-goog-api-key": this.apiKey, "content-type": "application/json" }, signal,
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${instruction} Source language: ${input.language}.` }, { inlineData: { mimeType: audio.mimeType, data: audio.base64 } }] }] }) });
    if (!response.ok) throw new Error(response.status === 429 ? "PROVIDER_QUOTA" : "PROVIDER_ERROR");
    const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const content = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return { providerId: this.id, model: this.model, value: parseCloudTranscript(content) };
  }
}
