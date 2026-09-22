import type { Transcript, TranscriptSegment } from "./types.js";

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MIN_SEGMENT_MS = 20;

interface ChunkBounds {
  chunkStartMs: number;
  chunkEndMs: number;
}

interface SherpaOutput {
  text?: unknown;
  tokens?: unknown;
  timestamps?: unknown;
}

export function parseSherpaOutput(raw: string, bounds: ChunkBounds): Transcript {
  validateBounds(bounds);
  if (Buffer.byteLength(raw, "utf8") > MAX_OUTPUT_BYTES) invalid();

  const parsed = lastJsonObject(raw) as SherpaOutput | null;
  const text = typeof parsed?.text === "string" ? parsed.text.trim() : "";
  if (!text) invalid();

  const tokens = parsed?.tokens;
  const timestamps = parsed?.timestamps;
  if (tokens === undefined && timestamps === undefined) {
    return { text, segments: [{ startMs: bounds.chunkStartMs, endMs: bounds.chunkEndMs, text }] };
  }
  if (!Array.isArray(tokens) || !Array.isArray(timestamps)
    || tokens.length === 0 || tokens.length !== timestamps.length
    || !tokens.every((token) => typeof token === "string" && token.trim())
    || !timestamps.every((timestamp) => typeof timestamp === "number" && Number.isFinite(timestamp))) {
    invalid();
  }

  return {
    text,
    segments: normalizeTokens(tokens as string[], timestamps as number[], bounds),
  };
}

function normalizeTokens(tokens: string[], timestamps: number[], bounds: ChunkBounds): TranscriptSegment[] {
  const lastStart = bounds.chunkEndMs - MIN_SEGMENT_MS;
  const desiredStarts = timestamps.map((seconds) => clamp(bounds.chunkStartMs + Math.round(seconds * 1_000), bounds.chunkStartMs, lastStart));
  const starts: number[] = [];
  for (const desired of desiredStarts) {
    const previous = starts.at(-1);
    starts.push(previous === undefined ? desired : Math.min(lastStart, Math.max(desired, previous + MIN_SEGMENT_MS)));
  }

  for (let index = starts.length - 2; index >= 0; index -= 1) {
    starts[index] = Math.min(starts[index]!, starts[index + 1]! - MIN_SEGMENT_MS);
  }

  return tokens.map((token, index) => ({
    startMs: starts[index]!,
    endMs: index + 1 < starts.length ? starts[index + 1]! : bounds.chunkEndMs,
    text: token.trim(),
  }));
}

function lastJsonObject(raw: string): unknown | null {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"' && depth > 0) quoted = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(raw.slice(start, index + 1));
    }
  }

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(candidates[index]!);
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Continue to an earlier complete object; diagnostics may contain braces.
    }
  }
  return null;
}

function validateBounds(bounds: ChunkBounds): void {
  if (!Number.isFinite(bounds.chunkStartMs) || !Number.isFinite(bounds.chunkEndMs)
    || bounds.chunkStartMs < 0 || bounds.chunkEndMs - bounds.chunkStartMs < MIN_SEGMENT_MS) invalid();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function invalid(): never {
  throw new Error("PARAFORMER_OUTPUT_INVALID");
}
