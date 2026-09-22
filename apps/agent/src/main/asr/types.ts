export type AsrLanguage = "auto" | "zh" | "en";

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface Transcript {
  text: string;
  segments: TranscriptSegment[];
}

export interface LocalAsrInput {
  audioPath: string;
  language: AsrLanguage;
  audioSha256: string;
}

export interface AsrResult extends Transcript {
  engine: "paraformer-local" | "gemini-audio" | "openrouter-stt";
  cacheIdentity: string;
}

export interface AsrFailure extends Error {
  code: "PARAFORMER_BINARY_MISSING" | "PARAFORMER_MODEL_MISSING" |
    "PARAFORMER_CHECKSUM_MISMATCH" | "PARAFORMER_START_FAILED" |
    "PARAFORMER_TIMEOUT" | "PARAFORMER_OUTPUT_INVALID" |
    "ASR_LANGUAGE_REVIEW_REQUIRED" | "ASR_FALLBACK_DISABLED";
  publicMessage: string;
  fallbackEligible: boolean;
}
