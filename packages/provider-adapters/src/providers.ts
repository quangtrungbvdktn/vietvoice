import { JsonHttpProvider } from "./http-provider.js";
import { GeminiAudioProvider } from "./gemini-audio-provider.js";
import { OpenRouterSttProvider } from "./openrouter-stt-provider.js";
import type { Provider } from "./types.js";

export interface ProviderSecrets {
  geminiApiKey?: string;
  openRouterApiKey?: string;
  openRouterAsrModel?: string;
  endpoints?: Partial<Record<"gemini" | "openrouter" | "edgeTts", string>>;
}

export function createProviderRegistry(secrets: ProviderSecrets): Map<string, Provider<unknown, unknown>> {
  const endpoint = secrets.endpoints ?? {};
  const providers = new Map<string, Provider<unknown, unknown>>();
  const geminiEndpoint = endpoint.gemini ?? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const openRouterEndpoint = endpoint.openrouter ?? "https://openrouter.ai/api/v1/chat/completions";
  if (secrets.geminiApiKey) {
    providers.set("gemini-audio", new GeminiAudioProvider(geminiEndpoint, secrets.geminiApiKey));
    providers.set("gemini", new JsonHttpProvider<string, TranslationInput>("gemini", "gemini-2.5-flash", geminiEndpoint, secrets.geminiApiKey, {
      headers: (apiKey) => ({ "x-goog-api-key": apiKey }),
      body: (input) => ({ contents: [{ role: "user", parts: [{ text: translationPrompt(input) }] }] }),
      parse: parseGeminiText,
    }));
  }
  if (secrets.openRouterApiKey) {
    if (secrets.openRouterAsrModel) providers.set("openrouter-stt", new OpenRouterSttProvider(openRouterEndpoint, secrets.openRouterApiKey, secrets.openRouterAsrModel));
    providers.set("openrouter", new JsonHttpProvider<string, TranslationInput>("openrouter", "openrouter/free", openRouterEndpoint, secrets.openRouterApiKey, {
      body: (input, model) => ({ model, messages: [{ role: "system", content: "Bạn là biên dịch viên video. Chỉ trả về bản dịch tiếng Việt tự nhiên." }, { role: "user", content: translationPrompt(input) }] }),
      parse: parseChatText,
    }));
  }
  providers.set("edge-tts", new JsonHttpProvider("edge-tts", "edge-tts", endpoint.edgeTts ?? "http://127.0.0.1:47831/tts", "local"));
  if (secrets.geminiApiKey) providers.set("gemini-tts", new JsonHttpProvider<VoiceOutput, VoiceInput>("gemini-tts", "gemini-2.5-flash-preview-tts", endpoint.gemini ?? "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent", secrets.geminiApiKey, {
      headers: (apiKey) => ({ "x-goog-api-key": apiKey }),
      body: (input) => ({ contents: [{ parts: [{ text: input.text }] }], generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voice } } } } }),
      parse: parseGeminiAudio,
    }));
  return providers;
}

interface TranslationInput { text: string; context?: string; glossary?: Record<string, string> }
interface VoiceInput { text: string; voice: string }
interface VoiceOutput { audioUrl: string; durationMs: number }
function translationPrompt(input: TranslationInput): string {
  const context = input.context ? `\nNgữ cảnh: ${input.context}` : "";
  const glossary = input.glossary ? `\nThuật ngữ bắt buộc: ${JSON.stringify(input.glossary)}` : "";
  return `Dịch nội dung sau sang tiếng Việt tự nhiên, giữ nguyên ý và tên riêng.${context}${glossary}\nNội dung:\n${input.text}`;
}
function parseGeminiText(response: unknown): string {
  const value = response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = value.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("PROVIDER_RESPONSE_INVALID");
  return text;
}
function parseChatText(response: unknown): string {
  const value = response as { choices?: Array<{ message?: { content?: string } }> };
  const text = value.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("PROVIDER_RESPONSE_INVALID");
  return text;
}
function parseGeminiAudio(response: unknown): VoiceOutput {
  const value = response as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> };
  const audio = value.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!audio?.data || !audio.mimeType) throw new Error("PROVIDER_RESPONSE_INVALID");
  const rate = Number(audio.mimeType.match(/rate=(\d+)/i)?.[1] ?? 24_000);
  const bytes = Buffer.from(audio.data, "base64").byteLength;
  return { audioUrl: `data:${audio.mimeType};base64,${audio.data}`, durationMs: Math.round(bytes / (rate * 2) * 1_000) };
}
