import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { JsonProjectRepository } from "@vietvoice/database";
import { PairingManager } from "@vietvoice/agent-protocol";
import { createProviderRegistry, ProviderRouter } from "@vietvoice/provider-adapters";
import { createApi } from "./app.js";
import { ProviderAgentAiService } from "./ai/provider-ai-service.js";
import { FileAgentAssetStore } from "./ai/agent-asset-store.js";
import { EditorStore } from "./routes/editor-store.js";
import { JobStore } from "./routes/job-store.js";

interface PrivateEnvironment {
  VIETVOICE_PRIVATE_ACCESS_TOKEN?: string;
  VIETVOICE_PRIVATE_USER_ID?: string;
  HOST?: string;
  PORT?: string;
  WEB_ORIGIN?: string;
  VIETVOICE_DATA_DIR?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_ASR_MODEL?: string;
  PUBLIC_API_URL?: string;
}

export function createPrivateApi(environment: PrivateEnvironment) {
  const accessToken = environment.VIETVOICE_PRIVATE_ACCESS_TOKEN;
  if (!accessToken) throw new Error("VIETVOICE_PRIVATE_ACCESS_TOKEN is required");
  const userId = environment.VIETVOICE_PRIVATE_USER_ID;
  if (!userId) throw new Error("VIETVOICE_PRIVATE_USER_ID is required");
  const dataDirectory = environment.VIETVOICE_DATA_DIR ?? join(process.cwd(), "data");
  const aiService = createAiService(environment);
  return createApi({
    projects: new JsonProjectRepository(join(dataDirectory, "projects.json")),
    pairing: new PairingManager({ persistencePath: join(dataDirectory, "pairing.json") }),
    editorStore: new EditorStore(join(dataDirectory, "editor.json")),
    jobStore: new JobStore(join(dataDirectory, "jobs.json")),
    ...(aiService ? { aiService } : {}),
    ...(environment.PUBLIC_API_URL ? { assetStore: new FileAgentAssetStore(join(dataDirectory, "agent-assets"), environment.PUBLIC_API_URL, 60 * 60 * 1_000) } : {}),
    verifyToken: async (candidate) => {
      const expected = Buffer.from(accessToken);
      const received = Buffer.from(candidate);
      return expected.length === received.length && timingSafeEqual(expected, received) ? { userId } : null;
    },
    allowedOrigin: environment.WEB_ORIGIN ?? "http://127.0.0.1:3100",
  });
}

function createAiService(environment: PrivateEnvironment): ProviderAgentAiService | undefined {
  if (!environment.GEMINI_API_KEY && !environment.OPENROUTER_API_KEY) return undefined;
  const providers = createProviderRegistry({
    ...(environment.GEMINI_API_KEY ? { geminiApiKey: environment.GEMINI_API_KEY } : {}),
    ...(environment.OPENROUTER_API_KEY ? { openRouterApiKey: environment.OPENROUTER_API_KEY } : {}),
    ...(environment.OPENROUTER_ASR_MODEL ? { openRouterAsrModel: environment.OPENROUTER_ASR_MODEL } : {}),
  });
  return new ProviderAgentAiService(new ProviderRouter(providers), { timeoutMs: 45_000, retries: 2 });
}

export async function startPrivateApi(environment: PrivateEnvironment = process.env): Promise<void> {
  const api = createPrivateApi(environment);
  await api.listen({ host: environment.HOST ?? "127.0.0.1", port: Number(environment.PORT ?? 3200) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startPrivateApi().catch((error) => { console.error(error); process.exitCode = 1; });
}
