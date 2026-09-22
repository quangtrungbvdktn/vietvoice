import { PairingError, PairingManager } from "@vietvoice/agent-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { authenticate, type TokenVerifier } from "../plugins/auth.js";

export function registerAgentRoutes(api: FastifyInstance, dependencies: { pairing: PairingManager; verifyToken: TokenVerifier }): void {
  api.post("/v1/agents/pairing-code", async (request, reply) => {
    const user = await authenticate(request, dependencies.verifyToken);
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const code = await dependencies.pairing.issue(user.userId);
    return reply.code(201).send({ code, expiresInSeconds: 600 });
  });

  api.post("/v1/agents/redeem", async (request, reply) => {
    const input = z.object({
      code: z.string().regex(/^\d{8}$/),
      deviceId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
    }).parse(request.body);
    try {
      return reply.code(201).send(await dependencies.pairing.redeem(input.code, { deviceId: input.deviceId, name: input.name }));
    } catch (error) {
      if (error instanceof PairingError) return reply.code(400).send({ error: error.code });
      throw error;
    }
  });
}
