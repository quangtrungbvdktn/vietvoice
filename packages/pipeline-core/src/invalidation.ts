import type { StageName } from "@vietvoice/contracts";
import { STAGE_ORDER } from "./graph.js";

export type PipelineChange = "source" | "transcript" | "translation" | "voice" | "subtitle_style" | "export_profile";
const START: Record<PipelineChange, StageName> = { source: "video_input", transcript: "transcript", translation: "translation", voice: "voice_generation", subtitle_style: "video_rendering", export_profile: "video_rendering" };

export function affectedStages(changes: PipelineChange[]): StageName[] {
  if (!changes.length) return [];
  const index = Math.min(...changes.map((change) => STAGE_ORDER.indexOf(START[change])));
  return STAGE_ORDER.slice(index).filter((stage) => !(changes.every((c) => c === "translation") && stage === "subtitle_generation"));
}
