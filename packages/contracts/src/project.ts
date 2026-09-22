import { z } from "zod";

import { ProjectIdSchema } from "./ids.js";

export const ProjectStatusSchema = z.enum([
  "draft",
  "scanning",
  "queued",
  "processing",
  "paused",
  "completed",
  "failed",
]);

export const ProjectSchema = z.object({
  id: ProjectIdSchema,
  ownerId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  status: ProjectStatusSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Project = z.infer<typeof ProjectSchema>;
