import { ProjectIdSchema } from "@vietvoice/contracts";
import type { PairingManager } from "@vietvoice/agent-protocol";
import type { ProjectRepository } from "@vietvoice/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, type TokenVerifier } from "../plugins/auth.js";
import { JobStore } from "./job-store.js";

const actionSchema = z.object({ action: z.enum(["cancel", "pause", "resume", "retry"]) });
const createSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1),
  mode: z.enum(["translate_subtitle", "translate_dub"]),
  concurrency: z.number().int().min(1).max(3),
});

export function registerJobRoutes(api: FastifyInstance, verifyToken: TokenVerifier, projects: ProjectRepository, pairing: PairingManager, jobs: JobStore) {

  api.post("/v1/projects/:id/jobs", async (request, reply) => {
    const projectId = ProjectIdSchema.parse((request.params as { id: string }).id);
    if (!await projects.get(request.user.userId, projectId)) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const input = createSchema.parse(request.body);
    return reply.code(202).send(jobs.create({ ownerId: request.user.userId, projectId, ...input }));
  });

  api.get("/v1/projects/:id/jobs", async (request, reply) => {
    const projectId = ProjectIdSchema.parse((request.params as { id: string }).id);
    if (!await projects.get(request.user.userId, projectId)) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    return jobs.list(request.user.userId, projectId);
  });

  api.patch("/jobs/:id", async (request, reply) => {
    const user = await authenticate(request, verifyToken);
    if (!user) return reply.code(401).send({ code: "UNAUTHORIZED" });
    const { id } = request.params as { id: string };
    const { action } = actionSchema.parse(request.body);
    return jobs.action(id, user.userId, action) ?? reply.code(404).send({ code: "JOB_NOT_FOUND", message: "Không tìm thấy tác vụ." });
  });

  api.post("/v1/agent/jobs/claim", async (request, reply) => {
    const device = await authenticateDevice(request.headers.authorization, pairing);
    if (!device) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    const job = jobs.claim(device.ownerId, device.deviceId);
    if (!job) return reply.code(204).send();
    return job;
  });

  api.post("/v1/agent/jobs/:id/complete", async (request, reply) => {
    const device = await authenticateDevice(request.headers.authorization, pairing);
    if (!device) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    const { id } = request.params as { id: string };
    const input = z.object({ leaseId: z.string().uuid(), artifact: z.object({ path: z.string().min(1), sha256: z.string().length(64) }) }).parse(request.body);
    return jobs.complete(id, device.ownerId, input.leaseId, input.artifact) ?? reply.code(404).send({ code: "JOB_LEASE_NOT_FOUND" });
  });

  api.post("/v1/agent/jobs/:id/fail", async (request, reply) => {
    const device = await authenticateDevice(request.headers.authorization, pairing);
    if (!device) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    const { id } = request.params as { id: string };
    const input = z.object({
      leaseId: z.string().uuid(),
      code: z.string().regex(/^[A-Z0-9_]{1,64}$/),
      message: z.string().min(1).max(500),
    }).parse(request.body);
    return jobs.fail(id, device.ownerId, input.leaseId, input) ?? reply.code(404).send({ code: "JOB_LEASE_NOT_FOUND" });
  });
}

async function authenticateDevice(header: string | undefined, pairing: PairingManager) {
  return header?.startsWith("Bearer ") ? pairing.authenticateDevice(header.slice(7)) : null;
}
