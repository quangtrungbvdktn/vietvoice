import { z } from "zod";

const EntityIdSchema = z.string().uuid();

export const ProjectIdSchema = EntityIdSchema.brand("ProjectId");
export const VideoAssetIdSchema = EntityIdSchema.brand("VideoAssetId");
export const PipelineRunIdSchema = EntityIdSchema.brand("PipelineRunId");

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type VideoAssetId = z.infer<typeof VideoAssetIdSchema>;
export type PipelineRunId = z.infer<typeof PipelineRunIdSchema>;
