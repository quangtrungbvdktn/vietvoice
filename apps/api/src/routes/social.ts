import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PublishService } from "../social/manual-package.js";
import type { PublishProvider } from "../social/types.js";
import type { EditorStore } from "./editor-store.js";
const Schema = z.object({ exportId: z.string().uuid(), caption: z.string(), hashtags: z.array(z.string()), visibility: z.enum(["private", "public"]), scheduledAt: z.string().datetime().optional() });
export function registerSocialRoutes(api: FastifyInstance, provider: PublishProvider, exports: EditorStore) { const service = new PublishService(provider); api.post("/v1/social/publish", async (request, reply) => { const input = Schema.parse(request.body); const record = exports.getExport(request.user.userId, input.exportId); if (!record) return reply.code(404).send({ code: "EXPORT_NOT_FOUND" }); return reply.code(202).send(await service.publish({ videoPath: `vietvoice-export://${record.id}`, caption: input.caption, hashtags: input.hashtags, visibility: input.visibility, ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}) })); }); }
