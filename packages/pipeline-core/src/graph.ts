import type { StageName } from "@vietvoice/contracts";

export const PIPELINE_GRAPH: Readonly<Record<StageName, readonly StageName[]>> = {
  video_input: [], media_processing: ["video_input"], audio_extraction: ["media_processing"],
  speech_recognition: ["audio_extraction"], language_detection: ["speech_recognition"], transcript: ["speech_recognition", "language_detection"],
  subtitle_generation: ["transcript"], translation: ["transcript"], voice_generation: ["translation"], audio_sync: ["voice_generation", "media_processing"],
  video_rendering: ["media_processing", "subtitle_generation", "translation", "audio_sync"], export: ["video_rendering"],
};

export const STAGE_ORDER = Object.keys(PIPELINE_GRAPH) as StageName[];
