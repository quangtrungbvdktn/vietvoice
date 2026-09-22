import { ProjectIdSchema } from "@vietvoice/contracts";
import {
  ProjectConflictError,
  type ProjectRepository,
} from "@vietvoice/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticate, type TokenVerifier } from "../plugins/auth.js";

const CreateProjectSchema = z.object({ name: z.string().trim().min(1).max(120) });
const RenameProjectSchema = CreateProjectSchema.extend({ version: z.number().int().nonnegative() });

export function registerProjectRoutes(
  api: FastifyInstance,
  dependencies: { projects: ProjectRepository; verifyToken: TokenVerifier },
): void {
  api.register(async (projectsApi) => {
    projectsApi.addHook("preHandler", async (request, reply) => {
      const user = await authenticate(request, dependencies.verifyToken);
      if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });
      request.user = user;
    });

    projectsApi.get("/v1/projects", async (request) => dependencies.projects.list(request.user.userId));

    projectsApi.post("/v1/projects", async (request, reply) => {
    const input = CreateProjectSchema.parse(request.body);
    return reply.code(201).send(await dependencies.projects.create(request.user.userId, input));
  });

    projectsApi.get("/v1/projects/:id", async (request, reply) => {
    const id = ProjectIdSchema.parse((request.params as { id: string }).id);
    const project = await dependencies.projects.get(request.user.userId, id);
    return project ?? reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
  });

    projectsApi.patch("/v1/projects/:id", async (request, reply) => {
    const id = ProjectIdSchema.parse((request.params as { id: string }).id);
    const input = RenameProjectSchema.parse(request.body);
    try {
      return await dependencies.projects.rename(request.user.userId, id, input.name, input.version);
    } catch (error) {
      if (error instanceof ProjectConflictError) return reply.code(409).send({ error: error.code });
      return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
    }
  });

    projectsApi.post("/v1/projects/:id/duplicate", async (request, reply) => {
    const id = ProjectIdSchema.parse((request.params as { id: string }).id);
    try {
      return reply.code(201).send(await dependencies.projects.duplicate(request.user.userId, id));
    } catch {
      return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
    }
  });

    projectsApi.delete("/v1/projects/:id", async (request, reply) => {
    const id = ProjectIdSchema.parse((request.params as { id: string }).id);
    try {
      await dependencies.projects.delete(request.user.userId, id);
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "PROJECT_NOT_FOUND" });
    }
    });
  });
}
