import { join } from "node:path";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { buildRenderPlan } from "@vietvoice/media-core";
import { CloudAiClient } from "./cloud-ai-client.js";
import { JsonStageCache } from "./jobs/json-stage-cache.js";
import { LocalJobExecutor } from "./jobs/local-job-executor.js";
import { createRealStageRunner } from "./jobs/real-stage-runner.js";
import { extractAudio } from "./jobs/extract-audio.js";
import { launchEdgeTts, synthesizeEdgeVoice } from "./jobs/edge-tts.js";
import { runRecoverableRender, executePlan } from "./jobs/render.js";
import { AgentPollingLoop } from "./polling-loop.js";
import { probeMedia } from "./sources/probe-media.js";
import { JsonSourceCatalog } from "./sources/source-catalog.js";
import { AgentRuntime } from "./runtime.js";
import { AsrRouter } from "./asr/asr-router.js";
import { createAsrCacheIdentity } from "./asr/asr-cache-identity.js";
import { resolveVerifiedParaformer, type ParaformerManifest } from "./asr/paraformer-manifest.js";
import { ParaformerRecognizer, type SpawnedProcess } from "./asr/paraformer-recognizer.js";

export async function createProcessingLoop(configuration: {
  apiUrl: string;
  deviceToken: string;
  userDataDirectory: string;
  workDirectory: string;
  resourceDirectory: string;
  environment?: NodeJS.ProcessEnv;
}): Promise<AgentPollingLoop> {
  const environment = configuration.environment ?? process.env;
  validateAsrEnvironment(environment);
  const cloud = new CloudAiClient(configuration, { request: fetch, readAudio: readFile });
  const manifest = JSON.parse(await readFile(join(configuration.resourceDirectory, "paraformer-manifest.json"), "utf8")) as ParaformerManifest;
  const verified = await resolveVerifiedParaformer(manifest, configuration.resourceDirectory);
  const threads = parseInteger(environment.PARAFORMER_THREADS, 4, 1, 64);
  const timeoutMs = parseInteger(environment.PARAFORMER_TIMEOUT_MS, 45_000, 1_000, 600_000);
  const local = new ParaformerRecognizer(verified, {
    spawnProcess: (command, args, options) => spawn(command, args, options) as unknown as SpawnedProcess,
    threads, timeoutMs,
  });
  const cacheIdentity = createAsrCacheIdentity({
    audioSha256: "per-source", runtimeVersion: verified.runtimeVersion, modelSha256: verified.modelSha256,
    tokensSha256: verified.tokensSha256, vadModelSha256: verified.modelSha256, vadConfig: { threshold: 0.5 },
    language: "auto", threads, stageVersion: 1,
  });
  const asr = new AsrRouter({ recognize: async (input, signal) => {
    const durationMs = (await probeMedia(input.audioPath, signal)).durationMs;
    if (!durationMs) throw new Error("MEDIA_DURATION_UNKNOWN");
    return local.recognize(input, { chunkStartMs: 0, chunkEndMs: durationMs }, signal);
  } }, cloud, { cacheIdentity, cloudFallbackEnabled: environment.ASR_FALLBACK_1 === "gemini" || environment.ASR_FALLBACK_2 === "openrouter" });
  const runner = createRealStageRunner({
    workDirectory: configuration.workDirectory,
    sourceCatalog: new JsonSourceCatalog(configuration.userDataDirectory),
    cloud,
    asr,
    probe: probeMedia,
    extractAudio,
    edgeVoice: (input) => synthesizeEdgeVoice(input, {
      launch: launchEdgeTts,
      probeDuration: async (path) => (await probeMedia(path)).durationMs ?? 0,
    }),
    render: async (input) => {
      const plan = buildRenderPlan(input, { preset: "original", resolution: "original", quality: "balanced", frameMode: "preserve" });
      await runRecoverableRender(plan, input.output, { execute: executePlan, remove: (path) => rm(path, { force: true }) });
    },
  });
  const executor = new LocalJobExecutor(new JsonStageCache(join(configuration.userDataDirectory, "pipeline-cache")), runner, () => cacheIdentity);
  const runtime = new AgentRuntime(configuration, { request: fetch, execute: (job) => executor.execute(job) });
  return new AgentPollingLoop(runtime, { sleep: abortableSleep, onError: () => undefined });
}

function validateAsrEnvironment(environment: NodeJS.ProcessEnv): void {
  if ((environment.ASR_ENGINE ?? "paraformer") !== "paraformer") throw new Error("ASR_ENGINE_UNSUPPORTED");
  if ((environment.PARAFORMER_DEVICE ?? "cpu") !== "cpu") throw new Error("PARAFORMER_DEVICE_UNSUPPORTED");
}
function parseInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error("PARAFORMER_CONFIGURATION_INVALID");
  return parsed;
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
