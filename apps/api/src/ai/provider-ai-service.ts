import type { ProviderPolicy, ProviderRouter } from "@vietvoice/provider-adapters";
import type { AgentAiService } from "../routes/agent-ai.js";

interface Segment { startMs: number; endMs: number; text: string }
interface Transcript { text: string; segments: Segment[] }
interface VoiceResult { audioUrl: string; durationMs: number }

export class ProviderAgentAiService implements AgentAiService {
  constructor(private readonly router: ProviderRouter, private readonly settings: { timeoutMs: number; retries: 1 | 2 | 3 }) {}

  async recognize(input: { audioUrl: string; language: "auto" | "zh" | "en"; provider: "gemini-audio" | "openrouter-stt" }): Promise<Transcript> {
    const result = await this.router.run<Transcript, typeof input>(input, input.provider, this.policy([]));
    return result.value;
  }

  async translateSegments(segments: Segment[]): Promise<string[]> {
    const translations: string[] = [];
    for (const segment of segments) {
      const result = await this.router.run<string, { text: string; context: string }>(
        { text: segment.text, context: "Lời thoại video; dịch ngắn gọn để khớp thời lượng phụ đề." },
        "gemini",
        this.policy(["openrouter"]),
      );
      translations.push(result.value);
    }
    return translations;
  }

  async synthesizeVoice(input: { text: string; voice: string }): Promise<{ audioBase64: string; mimeType: string; durationMs: number }> {
    const result = await this.router.run<VoiceResult, typeof input>(input, "gemini-tts", this.policy([]));
    const match = result.value.audioUrl.match(/^data:(.+);base64,(.+)$/s);
    if (!match) throw new Error("PROVIDER_RESPONSE_INVALID");
    return { audioBase64: match[2]!, mimeType: match[1]!, durationMs: result.value.durationMs };
  }

  private policy(fallbackProviderIds: string[]): ProviderPolicy {
    return { timeoutMs: this.settings.timeoutMs, retries: this.settings.retries, fallbackProviderIds };
  }
}
