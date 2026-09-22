import { ExportProfileSchema, ProjectIdSchema } from "@vietvoice/contracts";
import type { ProjectRepository } from "@vietvoice/database";
import { affectedStages, type PipelineChange } from "@vietvoice/pipeline-core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { EditorStore } from "./editor-store.js";

const PatchSchema = z.object({ expectedVersion: z.number().int().nonnegative(), transcript: z.string().optional(), translation: z.string().optional(), voice: z.string().optional(), subtitleStyle: z.record(z.unknown()).optional() });

export function registerEditorRoutes(api: FastifyInstance, projects: ProjectRepository, store: EditorStore) {
  api.patch("/v1/projects/:id/editor", async (request, reply) => {
    const projectId = ProjectIdSchema.parse((request.params as { id: string }).id);
    if (!await projects.get(request.user.userId, projectId)) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const { expectedVersion, ...changes } = PatchSchema.parse(request.body);
    const changeKinds = Object.keys(changes).map((field) => field === "subtitleStyle" ? "subtitle_style" : field) as PipelineChange[];
    const result = store.patch(`${request.user.userId}:${projectId}`, expectedVersion, changes, affectedStages(changeKinds));
    if (result.conflict) return reply.code(409).send({ code: "EDIT_CONFLICT", currentVersion: result.current.version, changedFields: result.current.changedFields });
    return { version: result.document.version, invalidatedStages: result.invalidatedStages };
  });

  api.post("/v1/projects/:id/exports", async (request, reply) => {
    const projectId = ProjectIdSchema.parse((request.params as { id: string }).id);
    if (!await projects.get(request.user.userId, projectId)) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const { profile } = z.object({ profile: ExportProfileSchema }).parse(request.body);
    return reply.code(201).send(store.createExport(request.user.userId, projectId, profile));
  });

  api.get("/v1/projects/:id/exports", async (request, reply) => {
    const projectId = ProjectIdSchema.parse((request.params as { id: string }).id);
    if (!await projects.get(request.user.userId, projectId)) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    return store.listExports(request.user.userId, projectId);
  });
}
