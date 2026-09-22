import type { ClaimedJob, CompletedArtifact } from "../runtime.js";

export type LocalStageName =
  | "video_input" | "media_processing" | "audio_extraction" | "speech_recognition"
  | "language_detection" | "transcript" | "subtitle_generation" | "translation"
  | "voice_generation" | "audio_sync" | "video_rendering" | "export";

const BASE_STAGES: readonly LocalStageName[] = [
  "video_input", "media_processing", "audio_extraction", "speech_recognition",
  "language_detection", "transcript", "subtitle_generation", "translation",
];
const DUB_STAGES: readonly LocalStageName[] = ["voice_generation", "audio_sync"];
const OUTPUT_STAGES: readonly LocalStageName[] = ["video_rendering", "export"];

export interface StageCache {
  get(jobId: string, sourceId: string, stage: LocalStageName, identity?: string): Promise<unknown | null>;
  put(jobId: string, sourceId: string, stage: LocalStageName, value: unknown, identity?: string): Promise<void>;
}

export interface StageExecution {
  job: ClaimedJob;
  sourceId: string;
  stage: LocalStageName;
  artifacts: ReadonlyMap<LocalStageName, unknown>;
}

export type StageRunner = (execution: StageExecution) => Promise<unknown>;

export class LocalJobExecutor {
  constructor(
    private readonly cache: StageCache,
    private readonly runStage: StageRunner,
    private readonly resolveAsrIdentity: (job: ClaimedJob, sourceId: string) => string | undefined = () => undefined,
  ) {}

  async execute(job: ClaimedJob): Promise<CompletedArtifact> {
    let completed: CompletedArtifact | null = null;
    for (const sourceId of job.sourceIds) completed = await this.executeSource(job, sourceId);
    if (!completed) throw new Error("JOB_HAS_NO_SOURCES");
    return completed;
  }

  private async executeSource(job: ClaimedJob, sourceId: string): Promise<CompletedArtifact> {
    const artifacts = new Map<LocalStageName, unknown>();
    const stages = job.mode === "translate_dub"
      ? [...BASE_STAGES, ...DUB_STAGES, ...OUTPUT_STAGES]
      : [...BASE_STAGES, ...OUTPUT_STAGES];
    const asrIdentity = this.resolveAsrIdentity(job, sourceId);

    for (const stage of stages) {
      const identity = identityStage(stage) ? asrIdentity : undefined;
      const cached = await this.cache.get(job.id, sourceId, stage, identity);
      if (cached !== null) {
        artifacts.set(stage, cached);
        continue;
      }
      const value = await this.runStage({ job, sourceId, stage, artifacts });
      await this.cache.put(job.id, sourceId, stage, value, identity);
      artifacts.set(stage, value);
    }

    return requireCompletedArtifact(artifacts.get("export"));
  }
}

function identityStage(stage: LocalStageName): boolean {
  return !["video_input", "media_processing", "audio_extraction"].includes(stage);
}

function requireCompletedArtifact(value: unknown): CompletedArtifact {
  if (!value || typeof value !== "object" || !("path" in value) || !("sha256" in value)
    || typeof value.path !== "string" || typeof value.sha256 !== "string" || !/^[a-f\d]{64}$/i.test(value.sha256)) {
    throw new Error("EXPORT_ARTIFACT_INVALID");
  }
  return { path: value.path, sha256: value.sha256 };
}
