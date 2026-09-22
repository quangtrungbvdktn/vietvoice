import type { AsrFailure, AsrResult, LocalAsrInput, Transcript } from "./types.js";

interface LocalRecognizer { recognize(input: LocalAsrInput, signal?: AbortSignal): Promise<Transcript> }
interface CloudRecognizer { recognizeFallback(audioPath: string, language: LocalAsrInput["language"], provider: "gemini-audio" | "openrouter-stt"): Promise<Transcript> }
interface RouterOptions { cacheIdentity: string; cloudFallbackEnabled: boolean }

export class AsrRouter {
  constructor(private readonly local: LocalRecognizer, private readonly cloud: CloudRecognizer | undefined, private readonly options: RouterOptions) {}

  async recognize(input: LocalAsrInput, signal?: AbortSignal): Promise<AsrResult> {
    try {
      const transcript = await this.local.recognize(input, signal);
      validateLanguage(transcript, input.language);
      return { ...transcript, engine: "paraformer-local", cacheIdentity: this.options.cacheIdentity };
    } catch (error) {
      if ((error as Error).name === "AbortError" || !(error as Partial<AsrFailure>).fallbackEligible) throw error;
      if (!this.options.cloudFallbackEnabled || !this.cloud) throw failure("ASR_FALLBACK_DISABLED", "ASR đám mây dự phòng chưa được cấu hình.", false);
    }
    try {
      const transcript = await this.cloud.recognizeFallback(input.audioPath, input.language, "gemini-audio");
      return { ...transcript, engine: "gemini-audio", cacheIdentity: this.options.cacheIdentity };
    } catch (geminiError) {
      try {
        const transcript = await this.cloud.recognizeFallback(input.audioPath, input.language, "openrouter-stt");
        return { ...transcript, engine: "openrouter-stt", cacheIdentity: this.options.cacheIdentity };
      } catch { throw geminiError; }
    }
  }
}

function validateLanguage(transcript: Transcript, language: LocalAsrInput["language"]): void {
  if (language !== "auto") return;
  const han = (transcript.text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const latin = (transcript.text.match(/[A-Za-z]/g) ?? []).length;
  if (han + latin === 0) throw failure("ASR_LANGUAGE_REVIEW_REQUIRED", "Không thể xác định ngôn ngữ nguồn.", false);
}
function failure(code: AsrFailure["code"], publicMessage: string, fallbackEligible: boolean): AsrFailure {
  return Object.assign(new Error(code), { code, publicMessage, fallbackEligible }) as AsrFailure;
}
