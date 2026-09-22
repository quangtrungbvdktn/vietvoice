import type { PairingManager } from "@vietvoice/agent-protocol";
import type { FastifyInstance } from "fastify";
import type { AgentAssetStore } from "../ai/agent-asset-store.js";

export function registerAgentAssetRoutes(api: FastifyInstance, pairing: PairingManager, store?: AgentAssetStore): void {
  api.post("/v1/agent/assets", async (request, reply) => {
    const device = request.headers.authorization?.startsWith("Bearer ")
      ? await pairing.authenticateDevice(request.headers.authorization.slice(7))
      : null;
    if (!device) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    if (!store) return reply.code(503).send({ code: "ASSET_STORE_NOT_CONFIGURED" });
    if (!Buffer.isBuffer(request.body) || request.body.length === 0) return reply.code(400).send({ code: "ASSET_EMPTY" });
    const extension = typeof request.headers["x-vietvoice-extension"] === "string" ? request.headers["x-vietvoice-extension"] : "wav";
    return reply.code(201).send(await store.put(request.body, extension));
  });

  api.get("/v1/agent/assets/:token", async (request, reply) => {
    if (!store) return reply.code(404).send({ code: "ASSET_NOT_FOUND" });
    const asset = await store.get((request.params as { token: string }).token);
    if (!asset) return reply.code(404).send({ code: "ASSET_NOT_FOUND" });
    return reply.header("content-type", asset.contentType).header("cache-control", "private, no-store").send(asset.body);
  });
}
