# VietVoice Hybrid Studio MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, working Web Dashboard and Windows Electron Agent that ingest authorized video sources, run a cached resumable AI/media pipeline, export translated or dubbed videos, and publish through approved TikTok and Facebook APIs.

**Architecture:** Use a pnpm TypeScript monorepo with Next.js for the Dashboard, Fastify for the orchestration API, Supabase/PostgreSQL for identity and durable records, BullMQ/Redis for background jobs, Cloudflare R2 for expiring intermediate artifacts, and Electron for the Windows Agent. Shared Zod contracts define all boundaries; the Agent performs local FFmpeg/yt-dlp operations while the API owns secrets, AI routing, OAuth, and authorization.

**Tech Stack:** Node.js 22 LTS, pnpm 10, TypeScript 5.7+, Next.js 15, React 19, Fastify 5, Electron 38+, Zod, Drizzle ORM, Supabase Auth/PostgreSQL, BullMQ/Redis, AWS SDK for R2, Vitest, Playwright, electron-builder, FFmpeg/ffprobe, yt-dlp.

**Spec:** `docs/superpowers/specs/2026-09-19-vietvoice-hybrid-mvp-design.md`

## Global Constraints

- Target Agent platform is Windows 10/11 x64; no GPU is required.
- Original and exported video remain local by default; upload only required compressed audio and intermediate artifacts.
- API keys and OAuth tokens are encrypted server-side and never returned to browser or Agent.
- Chinese recognition uses cloud FunASR Paraformer; English recognition uses Groq Whisper; no WhisperX or pyannote.
- Gemini is primary for translation/context/roles and OpenRouter is fallback.
- Edge TTS is primary voice generation and Gemini TTS is fallback.
- Provider timeout is 45 seconds; retry count is configurable from one to three; fallback runs only after primary failure.
- Pipeline stages are independently cached, cancellable, resumable, and invalidated only through changed dependencies.
- Source connectors must not bypass authentication, DRM, platform controls, or content permissions.
- Social publishing uses official TikTok and Facebook APIs; unavailable permissions produce a manual-ready export package.

## Review Focus

- Duplicate episodes with different filenames must resolve to one normalized source candidate without discarding genuinely different videos; covered by Task 4 tests.
- A network loss after a cloud stage succeeds but before Agent acknowledgement must resume idempotently without another billable call; covered by Task 5 tests.
- Chinese/English auto-detection with short, silent, or mixed-language openings must produce an editable decision rather than silently route incorrectly; covered by Task 6 tests.
- Disk exhaustion during render must preserve cached upstream artifacts, delete the incomplete output, and expose a recoverable error; covered by Task 7 tests.
- Expired social tokens or missing publish permissions must never lose the export and must produce an actionable manual package; covered by Task 9 tests.

---

## Planned repository structure

```text
apps/
  web/                 Next.js Dashboard and editors
  api/                 Fastify HTTP/WebSocket API and OAuth callbacks
  worker/              BullMQ cloud-stage workers
  agent/               Electron main, preload, renderer, and local job runner
packages/
  contracts/           Zod schemas and shared TypeScript types
  database/            Drizzle schema, migrations, and repositories
  pipeline-core/       Stage graph, cache keys, invalidation, and state machine
  provider-adapters/   STT, translation, role, and TTS provider interfaces
  agent-protocol/      Pairing and WebSocket messages
  media-core/          FFmpeg plans, progress parsing, and export presets
  source-connectors/   Local, YouTube, Douyin, and Hongguo connectors
  observability/       Structured logging and secret redaction
infra/
  docker-compose.yml   Local PostgreSQL-compatible services and Redis
  supabase/            SQL migrations and RLS policies
tests/
  e2e/                 Cross-app Playwright and Agent simulation tests
  fixtures/            Small licensed/generated audio-video fixtures
```

### Task 1: Monorepo foundation and shared contracts

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`
- Create: `packages/contracts/src/{ids,project,pipeline,agent,index}.ts`
- Test: `packages/contracts/src/contracts.test.ts`

**Interfaces:**
- Produces: `ProjectId`, `VideoAssetId`, `PipelineRunId`, `StageName`, `StageStatus`, `StageRun`, `AgentMessage`, and `ExportProfile` schemas used by every later task.

- [ ] **Step 1: Write contract tests for stable stage names and export presets**

```ts
import { describe, expect, it } from "vitest";
import { ExportProfileSchema, StageNameSchema } from "./index";

describe("shared contracts", () => {
  it("accepts the canonical pipeline", () => {
    expect(StageNameSchema.parse("speech_recognition")).toBe("speech_recognition");
  });
  it("rejects impossible concurrency and accepts vertical export", () => {
    expect(() => ExportProfileSchema.parse({ preset: "vertical", concurrency: 4 })).toThrow();
    expect(ExportProfileSchema.parse({ preset: "vertical", concurrency: 2 }).preset).toBe("vertical");
  });
});
```

- [ ] **Step 2: Run the test and verify the package is not yet defined**

Run: `pnpm vitest packages/contracts/src/contracts.test.ts --run`  
Expected: FAIL because the workspace and schemas do not exist.

- [ ] **Step 3: Create the workspace and minimal schemas**

```ts
export const StageNameSchema = z.enum([
  "video_input", "media_processing", "audio_extraction", "speech_recognition",
  "language_detection", "transcript", "subtitle_generation", "translation",
  "voice_generation", "audio_sync", "video_rendering", "export",
]);
export const ExportProfileSchema = z.object({
  preset: z.enum(["original", "vertical", "square", "landscape", "short_form"]),
  concurrency: z.number().int().min(1).max(3),
});
```

- [ ] **Step 4: Run contract tests and TypeScript checks**

Run: `pnpm vitest packages/contracts/src/contracts.test.ts --run && pnpm -r typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit the shared foundation**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .env.example packages/contracts
git commit -m "chore: establish shared VietVoice contracts"
```

### Task 2: Authentication, project database, and private Dashboard

**Files:**
- Create: `packages/database/src/{schema,repositories,client}.ts`
- Create: `infra/supabase/0001_projects.sql`
- Create: `apps/api/src/plugins/auth.ts`, `apps/api/src/routes/projects.ts`
- Create: `apps/web/app/{login,page,projects/[id]/page}.tsx`
- Test: `apps/api/test/projects.test.ts`, `apps/web/tests/dashboard.spec.ts`

**Interfaces:**
- Consumes: project and asset schemas from `@vietvoice/contracts`.
- Produces: `ProjectRepository.create/list/get/rename/duplicate/delete`, authenticated `/v1/projects` routes, and recent-project cards.

- [ ] **Step 1: Write an API test proving tenant isolation and project lifecycle**

```ts
it("never returns another user's project", async () => {
  const a = await seedUserAndProject("a@example.test");
  const bToken = await tokenFor("b@example.test");
  const response = await api.inject({ method: "GET", url: `/v1/projects/${a.project.id}`, headers: { authorization: `Bearer ${bToken}` } });
  expect(response.statusCode).toBe(404);
});
```

- [ ] **Step 2: Run the focused test**

Run: `pnpm --filter @vietvoice/api test -- projects.test.ts`  
Expected: FAIL because repositories and routes are absent.

- [ ] **Step 3: Add database tables, row-level policies, repositories, and routes**

```ts
export interface ProjectRepository {
  create(ownerId: string, input: CreateProjectInput): Promise<Project>;
  list(ownerId: string): Promise<ProjectSummary[]>;
  get(ownerId: string, id: ProjectId): Promise<Project | null>;
  duplicate(ownerId: string, id: ProjectId): Promise<Project>;
  rename(ownerId: string, id: ProjectId, name: string, version: number): Promise<Project>;
  delete(ownerId: string, id: ProjectId): Promise<void>;
}
```

- [ ] **Step 4: Build the login screen and recent-project Dashboard**

Implement project cards with thumbnail, name, total duration, item count, status, progress, and actions for continue, duplicate, rename, delete confirmation, re-export, and AI Pipeline.

- [ ] **Step 5: Verify API and browser behavior**

Run: `pnpm --filter @vietvoice/api test && pnpm --filter @vietvoice/web test:e2e -- dashboard.spec.ts`  
Expected: PASS, including 404 for cross-tenant access and a visible deletion confirmation.

- [ ] **Step 6: Commit the private project Dashboard**

```bash
git add apps/api apps/web packages/database infra/supabase
git commit -m "feat: add private project dashboard"
```

### Task 3: Agent pairing and durable Agent protocol

**Files:**
- Create: `packages/agent-protocol/src/{messages,pairing,index}.ts`
- Create: `apps/api/src/routes/agents.ts`, `apps/api/src/ws/agent-session.ts`
- Create: `apps/agent/src/main/{pairing,connection,store}.ts`
- Test: `packages/agent-protocol/src/protocol.test.ts`, `apps/api/test/agent-session.test.ts`

**Interfaces:**
- Produces: `POST /v1/agents/pairing-code`, `AgentHello`, `LeaseJob`, `StageProgress`, `StageCompleted`, and `StageFailed` messages.

- [ ] **Step 1: Write protocol tests for one-time pairing and replay rejection**

```ts
it("rejects a pairing code after first use", async () => {
  const code = await pairing.issue(userId, fakeClock.now());
  expect((await pairing.redeem(code, deviceInfo)).deviceToken).toBeTruthy();
  await expect(pairing.redeem(code, deviceInfo)).rejects.toMatchObject({ code: "PAIRING_CODE_USED" });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm vitest packages/agent-protocol apps/api/test/agent-session.test.ts --run`  
Expected: FAIL because pairing and message validation are absent.

- [ ] **Step 3: Implement expiring pairing, revocable device tokens, and heartbeat leases**

```ts
export type AgentMessage =
  | { type: "agent.hello"; deviceId: string; protocolVersion: 1 }
  | { type: "job.lease"; jobId: string; leaseId: string; expiresAt: string }
  | { type: "stage.progress"; leaseId: string; percent: number; detail?: string }
  | { type: "stage.completed"; leaseId: string; artifact: ArtifactRef }
  | { type: "stage.failed"; leaseId: string; error: PublicJobError };
```

- [ ] **Step 4: Persist Agent state and reconnect without losing leased work**

Store the device token in Electron safe storage and job leases/checkpoints in local SQLite. On reconnect, send the last acknowledged sequence number and reconcile active leases idempotently.

- [ ] **Step 5: Run protocol, reconnect, and revoked-device tests**

Run: `pnpm vitest packages/agent-protocol apps/api/test/agent-session.test.ts --run`  
Expected: PASS.

- [ ] **Step 6: Commit Agent pairing**

```bash
git add packages/agent-protocol apps/api/src/routes/agents.ts apps/api/src/ws apps/agent/src/main
git commit -m "feat: pair and reconnect Windows agents"
```

### Task 4: Source connectors, folder scans, and episode selection

**Files:**
- Create: `packages/source-connectors/src/{types,normalize,local,youtube,douyin,hongguo,index}.ts`
- Create: `apps/agent/src/main/sources/{scan-folder,probe-media,run-ytdlp}.ts`
- Create: `apps/web/app/projects/[id]/sources/page.tsx`
- Test: `packages/source-connectors/src/connectors.test.ts`, `apps/web/tests/source-selection.spec.ts`

**Interfaces:**
- Produces: `SourceConnector.scan(input, context): AsyncIterable<SourceCandidate>` and normalized `episodeNumber`, `durationMs`, `sourceIdentity`, and `contentFingerprint`.

- [ ] **Step 1: Write normalization tests for duplicate and ambiguous episodes**

```ts
it("deduplicates the same platform item but preserves different videos named episode 1", () => {
  const result = normalizeCandidates([
    candidate({ sourceIdentity: "yt:abc", title: "Tap 1.mp4" }),
    candidate({ sourceIdentity: "yt:abc", title: "Episode 01" }),
    candidate({ sourceIdentity: "local:def", title: "Episode 01" }),
  ]);
  expect(result).toHaveLength(2);
});
```

- [ ] **Step 2: Run connector tests**

Run: `pnpm --filter @vietvoice/source-connectors test`  
Expected: FAIL before connector contracts exist.

- [ ] **Step 3: Implement local and platform connector boundaries**

```ts
export interface SourceConnector {
  supports(input: SourceInput): boolean;
  scan(input: SourceInput, context: ScanContext): AsyncIterable<SourceCandidate>;
}
```

Local scanning uses ffprobe. Platform connectors call controlled yt-dlp subprocesses or authorized platform APIs, capture version/output, and return `SOURCE_AUTH_REQUIRED`, `SOURCE_UNSUPPORTED`, or `SOURCE_UNAVAILABLE` without bypass behavior.

- [ ] **Step 4: Build the searchable selection table**

Add duration/status filters, title/episode search, individual/range/all selection, duplicate badges, and “Add to queue”. Keep selections stable while scan results stream in.

- [ ] **Step 5: Verify connector fixtures and UI selection**

Run: `pnpm --filter @vietvoice/source-connectors test && pnpm --filter @vietvoice/web test:e2e -- source-selection.spec.ts`  
Expected: PASS for local folder, mocked playlists/channels, duplicates, missing duration, and unauthorized source responses.

- [ ] **Step 6: Commit source ingestion**

```bash
git add packages/source-connectors apps/agent/src/main/sources apps/web/app/projects
git commit -m "feat: scan and select video sources"
```

### Task 5: Resumable pipeline engine, cache, queue, and progress

**Files:**
- Create: `packages/pipeline-core/src/{graph,state-machine,cache-key,invalidation,errors,index}.ts`
- Create: `apps/worker/src/{queue,run-stage,reconcile}.ts`
- Create: `apps/api/src/routes/jobs.ts`
- Create: `apps/web/app/projects/[id]/pipeline/page.tsx`
- Test: `packages/pipeline-core/src/pipeline.test.ts`, `apps/worker/test/recovery.test.ts`

**Interfaces:**
- Produces: `PipelineEngine.plan(run, changes)`, `claimStage`, `reportProgress`, `completeStage`, `failStage`, `cancelRun`, and `resumeRun`.

- [ ] **Step 1: Write state, cache invalidation, and acknowledgement-loss tests**

```ts
it("reuses a completed billable stage after acknowledgement loss", async () => {
  const artifact = await engine.completeStage(lease, providerResult);
  await simulateConnectionLoss();
  const recovered = await engine.reconcile({ runId, agentLastAck: lease.sequence - 1 });
  expect(recovered.nextAction).toEqual({ type: "ack_completed", artifactId: artifact.id });
  expect(provider.calls).toBe(1);
});
```

- [ ] **Step 2: Run pipeline tests**

Run: `pnpm --filter @vietvoice/pipeline-core test && pnpm --filter @vietvoice/worker test`  
Expected: FAIL before graph/state/cache implementation.

- [ ] **Step 3: Implement the canonical DAG and dependency-aware cache keys**

```ts
export interface StageDefinition<I, O> {
  name: StageName;
  version: number;
  dependencies: StageName[];
  cacheKey(input: I, context: CacheContext): Promise<string>;
  execute(input: I, context: StageContext): Promise<O>;
}
```

- [ ] **Step 4: Implement BullMQ orchestration and concurrency controls**

Use separate queues for download, cloud AI, and local render. Project setting `concurrency` accepts one to three, while provider-specific rate limiters remain independent.

- [ ] **Step 5: Build live stage progress UI and controls**

Show canonical stages, active stage, percent, attempt count, elapsed/remaining time when available, public error, and Retry/Cancel/Pause/Resume actions. Never wait synchronously for media work.

- [ ] **Step 6: Verify recovery and invalidation cases**

Run: `pnpm --filter @vietvoice/pipeline-core test && pnpm --filter @vietvoice/worker test`  
Expected: PASS for translation-only invalidation, voice-only invalidation, style-only render, network loss, cancel, resume, and repeated completion messages.

- [ ] **Step 7: Commit pipeline orchestration**

```bash
git add packages/pipeline-core apps/worker apps/api/src/routes/jobs.ts apps/web/app/projects
git commit -m "feat: add resumable cached pipeline"
```

### Task 6: Cloud AI adapters and fallback router

**Files:**
- Create: `packages/provider-adapters/src/{types,router,funasr,groq-whisper,gemini,openrouter,edge-tts,gemini-tts,index}.ts`
- Create: `apps/worker/src/stages/{recognize,detect-language,translate,assign-roles,generate-voice}.ts`
- Test: `packages/provider-adapters/src/router.test.ts`, `apps/worker/test/ai-stages.test.ts`

**Interfaces:**
- Produces: `SpeechRecognizer`, `Translator`, `RoleAnalyzer`, `VoiceGenerator`, and `ProviderRouter.run(request, policy)`.

- [ ] **Step 1: Write fake-timer tests for 45-second timeout, retry, and fallback**

```ts
it("calls fallback only after primary times out and retries are exhausted", async () => {
  const promise = router.run(request, { timeoutMs: 45_000, retries: 2 });
  await vi.advanceTimersByTimeAsync(135_000);
  await expect(promise).resolves.toEqual(fallbackResult);
  expect(primary.run).toHaveBeenCalledTimes(3);
  expect(fallback.run).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add language-routing tests for silence and mixed openings**

Assert that low-confidence detection yields `needs_review` with editable Chinese/English choices and does not start a billable recognition call.

- [ ] **Step 3: Run adapter tests and verify failure**

Run: `pnpm --filter @vietvoice/provider-adapters test && pnpm --filter @vietvoice/worker test -- ai-stages.test.ts`  
Expected: FAIL before interfaces and adapters exist.

- [ ] **Step 4: Implement provider interfaces and secret-safe HTTP clients**

```ts
export interface ProviderPolicy {
  timeoutMs: 45_000;
  retries: 1 | 2 | 3;
  fallbackProviderIds: string[];
}
export interface ProviderResult<T> { providerId: string; model: string; value: T; usage?: Usage; }
```

Redact authorization headers and provider payload fields marked sensitive. Persist provider/model, normalized request hash, and successful response artifact for idempotency.

- [ ] **Step 5: Implement chunked recognition, contextual translation, roles, and voice segments**

Use overlapping timestamp chunks; merge transcripts deterministically; send glossary and neighboring context to translation; expose role assignments for user edits; generate voice per role and segment.

- [ ] **Step 6: Verify mocked provider contracts and fallback behavior**

Run: `pnpm --filter @vietvoice/provider-adapters test && pnpm --filter @vietvoice/worker test -- ai-stages.test.ts`  
Expected: PASS without real quota use.

- [ ] **Step 7: Commit AI routing**

```bash
git add packages/provider-adapters apps/worker/src/stages apps/worker/test
git commit -m "feat: route cloud AI with controlled fallback"
```

### Task 7: Local media stages, audio sync, rendering, and cleanup

**Files:**
- Create: `packages/media-core/src/{commands,progress,presets,audio-sync,cleanup,index}.ts`
- Create: `apps/agent/src/main/jobs/{extract-audio,blur-subtitles,mix-audio,render,cleanup}.ts`
- Test: `packages/media-core/src/media.test.ts`, `apps/agent/test/render.test.ts`

**Interfaces:**
- Produces: pure FFmpeg command plans, parsed progress events, export profiles, local artifact records, and cleanup manifests.

- [ ] **Step 1: Write command-plan tests for all aspect presets and safe argument handling**

```ts
it.each(["original", "vertical", "square", "landscape", "short_form"])("builds %s without shell interpolation", preset => {
  const plan = buildRenderPlan(fixture, profile({ preset }));
  expect(plan.executable).toBe("ffmpeg");
  expect(plan.shell).toBe(false);
  expect(plan.args.join(" ")).not.toContain("; rm");
});
```

- [ ] **Step 2: Write disk-exhaustion recovery test**

Assert `DISK_FULL` removes the partial output, preserves transcript/translation/voice artifacts, and marks rendering retryable after the destination changes.

- [ ] **Step 3: Run media tests**

Run: `pnpm --filter @vietvoice/media-core test && pnpm --filter @vietvoice/agent test -- render.test.ts`  
Expected: FAIL before media plans exist.

- [ ] **Step 4: Implement FFmpeg plan builders and progress parser**

```ts
export interface ProcessPlan { executable: string; args: string[]; shell: false; expectedDurationMs: number; }
export function parseFfmpegProgress(line: string, expectedDurationMs: number): RenderProgress | null;
```

- [ ] **Step 5: Implement extraction, optional subtitle blur, voice alignment, mixing, and render**

Support original/720p/1080p/custom resolution, original/9:16/1:1/16:9 ratios, crop/fit-blur/preserve framing, economy/balanced/high quality, SRT/ASS burn-in, original-dialogue ducking, and background audio retention.

- [ ] **Step 6: Implement reference-counted temporary cleanup and interrupted-render recovery**

Never remove artifacts referenced by another valid stage/cache entry. Clean expired unreferenced files on startup, completion, explicit project deletion, and a scheduled sweep.

- [ ] **Step 7: Verify generated fixtures with ffprobe**

Run: `pnpm --filter @vietvoice/media-core test && pnpm --filter @vietvoice/agent test -- render.test.ts`  
Expected: PASS with correct duration tolerance, dimensions, audio stream, subtitle result, progress, and cleanup.

- [ ] **Step 8: Commit local media pipeline**

```bash
git add packages/media-core apps/agent/src/main/jobs apps/agent/test
git commit -m "feat: render translated and dubbed videos locally"
```

### Task 8: Transcript editor, voice editor, export history, and re-export

**Files:**
- Create: `apps/web/app/projects/[id]/editor/page.tsx`
- Create: `apps/web/components/editor/{transcript-grid,subtitle-style,role-voice,export-panel}.tsx`
- Create: `apps/api/src/routes/{segments,exports}.ts`
- Test: `apps/api/test/segments.test.ts`, `apps/web/tests/editor.spec.ts`

**Interfaces:**
- Produces: versioned segment patch API, role/voice assignments, export records, and invalidation commands consumed by the pipeline engine.

- [ ] **Step 1: Write API tests for optimistic editing and precise invalidation**

```ts
it("changing only subtitle style invalidates render and export", async () => {
  const result = await patchProject(projectId, { expectedVersion: 3, subtitleStyle: style });
  expect(result.invalidatedStages).toEqual(["video_rendering", "export"]);
});
```

- [ ] **Step 2: Run editor tests**

Run: `pnpm --filter @vietvoice/api test -- segments.test.ts && pnpm --filter @vietvoice/web test:e2e -- editor.spec.ts`  
Expected: FAIL before patch routes and editor exist.

- [ ] **Step 3: Implement versioned transcript/translation/role patch routes**

Return HTTP 409 with the current version and changed fields when a user edit conflicts with a background result; never silently overwrite.

- [ ] **Step 4: Build the editor and export panel**

Provide synchronized video preview, searchable segment grid, original/translated text, speaker role, voice, timing, subtitle style, original-dialogue level, presets, resolution, ratio, quality, framing, and render progress.

- [ ] **Step 5: Add project history and non-destructive re-export**

Each export is immutable and points to its profile and pipeline snapshot. Re-export creates a new record and only replaces a local file after explicit confirmation.

- [ ] **Step 6: Verify edits reuse upstream cache**

Run: `pnpm --filter @vietvoice/api test -- segments.test.ts && pnpm --filter @vietvoice/web test:e2e -- editor.spec.ts`  
Expected: PASS for translation edit, voice change, subtitle style change, conflict, re-export, and history continuation.

- [ ] **Step 7: Commit editor and history**

```bash
git add apps/web/app/projects apps/web/components/editor apps/api/src/routes apps/api/test
git commit -m "feat: edit and re-export cached projects"
```

### Task 9: TikTok and Facebook publishing with manual fallback

**Files:**
- Create: `apps/api/src/social/{types,token-store,tiktok,facebook,manual-package}.ts`
- Create: `apps/api/src/routes/social.ts`, `apps/worker/src/publish/run-publish.ts`
- Create: `apps/web/app/projects/[id]/publish/page.tsx`
- Test: `apps/api/test/social.test.ts`, `apps/web/tests/publish.spec.ts`

**Interfaces:**
- Produces: encrypted social connection records, `PublishProvider.publish`, scheduled `PublishJob`, and manual-ready export packages.

- [ ] **Step 1: Write tests for expired tokens and unavailable permissions**

```ts
it("keeps the export and creates a manual package when permission is missing", async () => {
  provider.publish.mockRejectedValue(new PublishError("PUBLISH_PERMISSION_REQUIRED"));
  const result = await service.publish(job);
  expect(result.status).toBe("manual_ready");
  expect(result.package.files).toEqual(expect.arrayContaining(["video.mp4", "caption.txt"]));
});
```

- [ ] **Step 2: Run social tests**

Run: `pnpm --filter @vietvoice/api test -- social.test.ts && pnpm --filter @vietvoice/web test:e2e -- publish.spec.ts`  
Expected: FAIL before publishing adapters exist.

- [ ] **Step 3: Implement encrypted OAuth token storage and official provider adapters**

```ts
export interface PublishProvider {
  authorize(input: OAuthCallback): Promise<SocialConnection>;
  publish(input: PublishRequest): Promise<{ platformPostId: string; publicUrl?: string }>;
  refresh(connection: SocialConnection): Promise<SocialConnection>;
}
```

- [ ] **Step 4: Build publish confirmation and scheduling UI**

Show final video, account, caption, hashtags, visibility, and time. Require explicit confirmation before creating a publish job.

- [ ] **Step 5: Implement status polling/webhooks and manual package fallback**

Persist Queued, Uploading, Platform processing, Published, Failed, or Manual ready. Never delete or alter the completed export on publish failure.

- [ ] **Step 6: Verify provider mocks, token expiry, missing permission, and schedule**

Run: `pnpm --filter @vietvoice/api test -- social.test.ts && pnpm --filter @vietvoice/web test:e2e -- publish.spec.ts`  
Expected: PASS.

- [ ] **Step 7: Commit social publishing**

```bash
git add apps/api/src/social apps/api/src/routes/social.ts apps/worker/src/publish apps/web/app/projects apps/api/test apps/web/tests
git commit -m "feat: publish exports through approved social APIs"
```

### Task 10: Security hardening, Windows packaging, and end-to-end release gate

**Files:**
- Create: `packages/observability/src/{logger,redaction}.ts`
- Create: `apps/agent/electron-builder.yml`, `apps/agent/scripts/verify-binaries.mjs`
- Create: `tests/e2e/{full-pipeline,recovery,secret-leak}.spec.ts`
- Create: `docs/operations/{deployment,provider-setup,windows-agent,incident-recovery}.md`
- Modify: all app package scripts and CI workflow

**Interfaces:**
- Consumes all earlier components.
- Produces signed-ready Windows artifacts, deployment documentation, security checks, and a private-release test report.

- [ ] **Step 1: Write secret-leak and redaction tests**

```ts
it("never serializes server secrets into browser or Agent payloads", async () => {
  const bundleText = await readBuiltClientBundles();
  expect(bundleText).not.toContain(process.env.GEMINI_API_KEY!);
  expect(JSON.stringify(await capturedAgentMessages())).not.toContain(process.env.OPENROUTER_API_KEY!);
});
```

- [ ] **Step 2: Write full-pipeline and recovery tests with generated fixtures**

Cover local file input, mocked URL collection, Chinese subtitles mode, English dubbing mode, 1–3 lane queue, Agent restart, API timeout, fallback, cancel/resume, style-only re-render, disk-full recovery, and manual social package.

- [ ] **Step 3: Run the release tests and record failures**

Run: `pnpm test && pnpm test:e2e`  
Expected: FAIL until packaging, redaction, and integration gaps are closed.

- [ ] **Step 4: Add centralized redaction and audit logging**

Redact authorization headers, API keys, OAuth tokens, signed URLs, source cookies, local absolute paths where unnecessary, and provider payload fields marked sensitive. Emit stable event names and correlation IDs.

- [ ] **Step 5: Package Windows Agent and verify bundled binaries**

Configure electron-builder for Windows x64. Verify FFmpeg/ffprobe/yt-dlp checksums, versions, executable paths, safe-storage availability, startup cleanup, and upgrade compatibility. Do not enable unsigned auto-update for the private MVP.

- [ ] **Step 6: Add CI and deployment documentation**

CI runs typecheck, unit/integration tests, web build, API build, Agent unpacked build, security scans, and fixture E2E tests. Documentation lists exact required environment keys without values and explains provider/OAuth configuration, backups, retention, and incident recovery.

- [ ] **Step 7: Run the complete release gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e && pnpm --filter @vietvoice/agent dist:win`  
Expected: all commands PASS; Windows artifact installs on Windows 10/11 x64; no secret appears in browser assets, Agent traffic, logs, or crash output.

- [ ] **Step 8: Commit the private MVP release candidate**

```bash
git add packages/observability apps/agent tests/e2e docs/operations .github package.json
git commit -m "feat: prepare private VietVoice MVP release"
```

## Execution order and review gates

- Milestone A: Tasks 1–3 — secure foundation, private projects, paired Agent.
- Milestone B: Tasks 4–5 — real source ingestion and resumable modular pipeline.
- Milestone C: Tasks 6–7 — cloud AI plus local translated/dubbed rendering.
- Milestone D: Task 8 — human editing, history, and re-export.
- Milestone E: Task 9 — official social publishing and manual fallback.
- Milestone F: Task 10 — security, packaging, reliability, and private release.

At each milestone, run its complete test set, perform a focused code review, and produce a working demonstration before starting the next milestone.

