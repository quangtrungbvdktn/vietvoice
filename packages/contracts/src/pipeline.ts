import { z } from "zod";

import { PipelineRunIdSchema } from "./ids.js";

export const StageNameSchema = z.enum([
  "video_input",
  "media_processing",
  "audio_extraction",
  "speech_recognition",
  "language_detection",
  "transcript",
  "subtitle_generation",
  "translation",
  "voice_generation",
  "audio_sync",
  "video_rendering",
  "export",
]);

export const StageStatusSchema = z.enum([
  "pending",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const StageRunSchema = z.object({
  runId: PipelineRunIdSchema,
  stage: StageNameSchema,
  status: StageStatusSchema,
  progress: z.number().min(0).max(100),
  attempt: z.number().int().positive(),
  cacheKey: z.string().min(1),
});

export const QueueSettingsSchema = z.object({
  concurrency: z.number().int().min(1).max(3),
});

export const ExportProfileSchema = z.object({
  preset: z.enum(["original", "vertical", "square", "landscape", "short_form"]),
  resolution: z.enum(["original", "720p", "1080p", "custom"]),
  quality: z.enum(["economy", "balanced", "high"]),
  frameMode: z.enum(["crop", "fit_blur", "preserve"]),
});

export type StageName = z.infer<typeof StageNameSchema>;
export type StageStatus = z.infer<typeof StageStatusSchema>;
export type StageRun = z.infer<typeof StageRunSchema>;
export type QueueSettings = z.infer<typeof QueueSettingsSchema>;
export type ExportProfile = z.infer<typeof ExportProfileSchema>;
