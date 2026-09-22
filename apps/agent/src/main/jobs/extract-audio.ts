import { buildAudioExtractPlan } from "@vietvoice/media-core";
import { executePlan } from "./render.js";

export function extractAudio(input: string, output: string, durationMs: number, signal?: AbortSignal): Promise<void> {
  return executePlan(buildAudioExtractPlan(input, output, durationMs), signal);
}
