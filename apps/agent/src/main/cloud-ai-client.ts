import { readFile } from "node:fs/promises";
import { extname } from "node:path";

interface Segment { startMs: number; endMs: number; text: string }
interface Transcript { text: string; segments: Segment[] }
interface VoiceFallback { audioBase64: string; mimeType: string; durationMs: number }

export class CloudAiClient {
  private readonly uploadedAudio = new Map<string, Promise<string>>();
  constructor(
    private readonly configuration: { apiUrl: string; deviceToken: string },
    private readonly dependencies: { request: typeof fetch; readAudio(path: string): Promise<Buffer> } = { request: fetch, readAudio: readFile },
  ) {}

  async recognizeFallback(audioPath: string, language: "auto" | "zh" | "en", provider: "gemini-audio" | "openrouter-stt"): Promise<Transcript> {
    let uploaded = this.uploadedAudio.get(audioPath);
    if (!uploaded) {
      uploaded = this.upload(audioPath);
      this.uploadedAudio.set(audioPath, uploaded);
    }
    const audioUrl = await uploaded;
    return this.post<Transcript>("/v1/agent/ai/recognize", { audioUrl, language, provider });
  }

  private async upload(audioPath: string): Promise<string> {
    const upload = await this.dependencies.request(`${this.baseUrl()}/v1/agent/assets`, {
      method: "POST",
      headers: { ...this.authHeaders(), "content-type": "application/octet-stream", "x-vietvoice-extension": extname(audioPath).slice(1) || "wav" },
      body: await this.dependencies.readAudio(audioPath) as unknown as BodyInit,
    });
    const published = await responseJson<{ audioUrl: string }>(upload, "AUDIO_UPLOAD_FAILED");
    return published.audioUrl;
  }

  translateSegments(segments: Segment[]): Promise<string[]> {
    return this.post("/v1/agent/ai/translate", { segments });
  }

  synthesizeVoice(text: string, voice: string): Promise<VoiceFallback> {
    return this.post("/v1/agent/ai/voice", { text, voice });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.dependencies.request(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: { ...this.authHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return responseJson<T>(response, "CLOUD_AI_FAILED");
  }

  private authHeaders(): { authorization: string } { return { authorization: `Bearer ${this.configuration.deviceToken}` }; }
  private baseUrl(): string { return this.configuration.apiUrl.replace(/\/$/, ""); }
}

async function responseJson<T>(response: Response, code: string): Promise<T> {
  if (!response.ok) throw Object.assign(new Error(`${code}_${response.status}`), { code, publicMessage: "Dịch vụ AI đám mây đang bận hoặc chưa được cấu hình. Hãy thử lại." });
  return response.json() as Promise<T>;
}
