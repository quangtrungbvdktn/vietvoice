import { PairingManager } from "@vietvoice/agent-protocol";
import type { ProjectRepository } from "@vietvoice/database";
import Fastify from "fastify";

import { authenticate, type AuthenticatedUser, type TokenVerifier } from "./plugins/auth.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { EditorStore } from "./routes/editor-store.js";
import { registerEditorRoutes } from "./routes/segments.js";
import { registerSocialRoutes } from "./routes/social.js";
import { JobStore } from "./routes/job-store.js";
import { PublishError, type PublishProvider } from "./social/types.js";
import { registerAgentAiRoutes, type AgentAiService } from "./routes/agent-ai.js";
import { registerAgentAssetRoutes } from "./routes/agent-assets.js";
import type { AgentAssetStore } from "./ai/agent-asset-store.js";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser;
  }
}

export function createApi(dependencies: {
  projects: ProjectRepository;
  verifyToken: TokenVerifier;
  pairing?: PairingManager;
  socialProvider?: PublishProvider;
  allowedOrigin?: string;
  editorStore?: EditorStore;
  jobStore?: JobStore;
  aiService?: AgentAiService;
  assetStore?: AgentAssetStore;
}) {
  const api = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });
  api.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => done(null, body));
  const pairing = dependencies.pairing ?? new PairingManager();
  if (dependencies.allowedOrigin) {
    api.addHook("onSend", async (request, reply) => {
      if (request.headers.origin === dependencies.allowedOrigin) {
        reply.header("access-control-allow-origin", dependencies.allowedOrigin);
        reply.header("access-control-allow-headers", "authorization, content-type");
        reply.header("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
        reply.header("vary", "Origin");
      }
    });
    api.options("/*", async (_request, reply) => reply.code(204).send());
  }
  api.addHook("preHandler", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    if (request.method === "POST" && request.url === "/v1/agents/redeem" || request.url.startsWith("/v1/agent/")) return;
    const user = await authenticate(request, dependencies.verifyToken);
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });
    request.user = user;
  });
  registerProjectRoutes(api, dependencies);
  registerAgentRoutes(api, {
    pairing,
    verifyToken: dependencies.verifyToken,
  });
  registerJobRoutes(api, dependencies.verifyToken, dependencies.projects, pairing, dependencies.jobStore ?? new JobStore());
  registerAgentAiRoutes(api, pairing, dependencies.aiService);
  registerAgentAssetRoutes(api, pairing, dependencies.assetStore);
  const editorStore = dependencies.editorStore ?? new EditorStore();
  registerEditorRoutes(api, dependencies.projects, editorStore);
  registerSocialRoutes(api, dependencies.socialProvider ?? { publish: async () => { throw new PublishError("PUBLISH_PERMISSION_REQUIRED"); } }, editorStore);
  return api;
}
