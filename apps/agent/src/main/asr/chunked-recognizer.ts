import type { LocalAsrInput, Transcript } from "./types.js";

export interface SpeechChunk { index: number; path: string; startMs: number; endMs: number; sha256: string }
export interface ChunkCheckpointStore {
  get(key: string): Promise<Transcript | null>;
  put(key: string, value: Transcript): Promise<void>;
}
interface Dependencies {
  detectSpeechChunks(input: LocalAsrInput, signal?: AbortSignal): Promise<SpeechChunk[]>;
  decode(chunk: SpeechChunk, input: LocalAsrInput, signal?: AbortSignal): Promise<Transcript>;
}

export class ChunkedRecognizer {
  constructor(private readonly dependencies: Dependencies, private readonly checkpoints: ChunkCheckpointStore) {}

  async recognize(input: LocalAsrInput, cacheIdentity: string, signal?: AbortSignal): Promise<Transcript> {
    const chunks = (await this.dependencies.detectSpeechChunks(input, signal)).sort((a, b) => a.index - b.index);
    const transcripts: Transcript[] = [];
    for (const chunk of chunks) {
      if (signal?.aborted) throw abortError();
      const key = `${input.audioSha256}:${cacheIdentity}:${chunk.index}:${chunk.sha256}`;
      let transcript = await this.checkpoints.get(key);
      if (!transcript) {
        transcript = await this.dependencies.decode(chunk, input, signal);
        await this.checkpoints.put(key, transcript);
      }
      transcripts.push({ text: transcript.text, segments: transcript.segments.map((segment) => ({
        ...segment, startMs: segment.startMs + chunk.startMs, endMs: segment.endMs + chunk.startMs,
      })) });
    }
    return {
      text: joinTexts(transcripts.map((item) => item.text)),
      segments: transcripts.flatMap((item) => item.segments),
    };
  }
}

function joinTexts(texts: string[]): string {
  return texts.reduce((result, text) => !result ? text : /[\u3400-\u9fff]$/u.test(result) && /^[\u3400-\u9fff]/u.test(text) ? result + text : `${result} ${text}`, "");
}
function abortError(): Error { return Object.assign(new Error("Aborted"), { name: "AbortError" }); }
