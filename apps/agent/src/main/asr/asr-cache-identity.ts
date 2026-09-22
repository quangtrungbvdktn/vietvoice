import { createHash } from "node:crypto";
import type { AsrLanguage } from "./types.js";

export interface AsrCacheIdentityInput {
  audioSha256: string;
  runtimeVersion: string;
  modelSha256: string;
  tokensSha256: string;
  vadModelSha256: string;
  vadConfig: Record<string, number | string | boolean>;
  language: AsrLanguage;
  threads: number;
  stageVersion: number;
  [ignored: string]: unknown;
}

export function createAsrCacheIdentity(input: AsrCacheIdentityInput): string {
  const relevant = {
    audioSha256: input.audioSha256, runtimeVersion: input.runtimeVersion,
    modelSha256: input.modelSha256, tokensSha256: input.tokensSha256,
    vadModelSha256: input.vadModelSha256,
    vadConfig: Object.fromEntries(Object.entries(input.vadConfig).sort(([a], [b]) => a.localeCompare(b))),
    language: input.language, threads: input.threads, stageVersion: input.stageVersion,
  };
  return createHash("sha256").update(JSON.stringify(relevant)).digest("hex");
}
