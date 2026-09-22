# VietVoice Local Paraformer ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every Alibaba/DashScope and Groq recognition path with CPU-only sherpa-onnx Paraformer INT8 in the Windows Agent, with Gemini Audio then OpenRouter STT as optional server-side fallbacks, and prove the path on the authorized Chinese sample video.

**Architecture:** The Electron Agent owns audio extraction and local speech recognition. A typed `AsrRouter` calls a verified, shell-free sherpa-onnx process first; only eligible local failures cause the existing Agent asset transport to upload audio to the private API, where Gemini Audio and then OpenRouter STT run behind server-only keys. Recognition artifacts carry an explicit cache identity so changing a binary, model, language, VAD settings, or audio invalidates only ASR and downstream stages. The implementation uses the bilingual timestamp-capable `sherpa-onnx-paraformer-zh-2023-09-14` INT8 checkpoint rather than separate Chinese and English checkpoints.

**Tech Stack:** TypeScript 5.7, Node.js 22, Electron 38, Vitest 3, sherpa-onnx Windows x64 CLI, Paraformer INT8 ONNX, FFmpeg/ffprobe, Fastify API, Gemini Audio API, OpenRouter audio/STT API, electron-builder/NSIS.

**Spec:** `docs/superpowers/specs/2026-09-21-vietvoice-local-paraformer-design.md`

## Global Constraints

- Keep `ASR_ENGINE=paraformer`; do not add WhisperX, pyannote, Python FunASR, Alibaba Cloud, DashScope, or Groq ASR.
- Use `spawn(..., { shell: false })`; no executable path, model path, token path, or CLI argument may originate from project/transcript text.
- Keep `GEMINI_API_KEY` and `OPENROUTER_API_KEY` on the API server. They must not enter web or Electron bundles.
- Do not upload audio when local recognition succeeds. Fallback order is exactly local Paraformer → Gemini Audio → OpenRouter STT.
- Cloud timeout is 45 seconds per attempt; retry count is configurable from 1–3 and defaults to 2.
- Do not commit the 13.5 MB authorized video. E2E consumes it through `VIETVOICE_E2E_CHINESE_VIDEO`.
- Pin the sherpa runtime and model archive to official release URLs and record actual SHA-256 values before packaging; no `replace-with-*` checksum may survive the packaging task.
- Every implementation task begins with a failing test and ends with a focused commit.

## Review Focus

- Windows paths containing spaces and non-ASCII characters, including `Vd Trung.mp4` and Vietnamese user-data directories.
- Malformed, truncated, oversized, or mixed log/JSON output from the sherpa CLI.
- Missing/corrupt binary, model, token file, or DLL when cloud fallback is disabled.
- Cancellation and resumable chunk checkpoints for long audio.
- Monotonic, non-negative timestamps for mixed Chinese–English speech, including zero-duration and overlapping token timestamps.

---

### Task 1: Define the local ASR contract and safe sherpa output parser

**Files:**

- Create: `apps/agent/src/main/asr/types.ts`
- Create: `apps/agent/src/main/asr/sherpa-output.ts`
- Create: `apps/agent/test/sherpa-output.test.ts`
- Modify: `apps/agent/tsconfig.json` only if the new directory is not already included

- [ ] **Step 1: Write failing normalization tests**

Add fixtures inline to `apps/agent/test/sherpa-output.test.ts` for valid Chinese, valid mixed Chinese–English, malformed/truncated JSON, an empty transcript, output larger than 4 MiB, negative timestamps, overlapping timestamps, and zero-duration final tokens.

```ts
it("normalizes mixed tokens into monotonic segments", () => {
  const transcript = parseSherpaOutput(JSON.stringify({
    text: "你好 OpenAI",
    tokens: ["你", "好", " OpenAI"],
    timestamps: [0, 0.42, 0.39],
  }), { chunkStartMs: 1_000, chunkEndMs: 3_000 });
  expect(transcript.text).toBe("你好 OpenAI");
  expect(transcript.segments[0]).toMatchObject({ startMs: 1_000 });
  expect(transcript.segments.every((s, i, all) => s.endMs > s.startMs && (!i || s.startMs >= all[i - 1]!.endMs))).toBe(true);
});

it.each(["{", "{}", '{"text":"","tokens":[],"timestamps":[]}'])(
  "rejects invalid output %s",
  (raw) => expect(() => parseSherpaOutput(raw, { chunkStartMs: 0, chunkEndMs: 2_000 }))
    .toThrowError(/PARAFORMER_OUTPUT_INVALID/),
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vietvoice/agent test -- sherpa-output.test.ts`

Expected: FAIL because `../src/main/asr/sherpa-output.js` does not exist.

- [ ] **Step 3: Add exact shared types**

Implement in `types.ts`:

```ts
export type AsrLanguage = "auto" | "zh" | "en";
export interface TranscriptSegment { startMs: number; endMs: number; text: string }
export interface Transcript { text: string; segments: TranscriptSegment[] }
export interface LocalAsrInput { audioPath: string; language: AsrLanguage; audioSha256: string }
export interface AsrResult extends Transcript {
  engine: "paraformer-local" | "gemini-audio" | "openrouter-stt";
  cacheIdentity: string;
}
export interface AsrFailure extends Error {
  code: "PARAFORMER_BINARY_MISSING" | "PARAFORMER_MODEL_MISSING" |
    "PARAFORMER_CHECKSUM_MISMATCH" | "PARAFORMER_START_FAILED" |
    "PARAFORMER_TIMEOUT" | "PARAFORMER_OUTPUT_INVALID" |
    "ASR_LANGUAGE_REVIEW_REQUIRED" | "ASR_FALLBACK_DISABLED";
  publicMessage: string;
  fallbackEligible: boolean;
}
```

- [ ] **Step 4: Implement bounded parsing and timestamp normalization**

`parseSherpaOutput(raw, bounds)` must reject more than 4 MiB, extract the last complete JSON object from mixed stdout logs, require non-empty `text`, accept `tokens`/`timestamps`, and produce monotonic segments clamped to the chunk. Use a minimum 20 ms duration and merge tokens whose normalized range would overlap. If token timestamps are absent, return one coarse segment spanning the VAD chunk.

- [ ] **Step 5: Run tests and typecheck**

Run: `pnpm --filter @vietvoice/agent test -- sherpa-output.test.ts && pnpm --filter @vietvoice/agent typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/main/asr apps/agent/test/sherpa-output.test.ts apps/agent/tsconfig.json
git commit -m "feat(agent): normalize sherpa paraformer output"
```

### Task 2: Verify the runtime/model manifest and execute sherpa safely

**Files:**

- Create: `apps/agent/src/main/asr/paraformer-manifest.ts`
- Create: `apps/agent/src/main/asr/paraformer-recognizer.ts`
- Create: `apps/agent/test/paraformer-manifest.test.ts`
- Create: `apps/agent/test/paraformer-recognizer.test.ts`
- Modify: `apps/agent/src/main/binaries.ts`
- Create: `apps/agent/resources/paraformer-manifest.json`

- [ ] **Step 1: Write failing manifest tests**

Test that the manifest requires schema version `1`, runtime version, model ID, executable, DLL list, `model.int8.onnx`, `tokens.txt`, official source URLs, licenses, sizes, and 64-hex SHA-256 for every file. Test missing files, a checksum mismatch, and a Windows path with spaces/non-ASCII characters. Stub filesystem/hash dependencies; do not need downloaded models for unit tests.

```ts
await expect(resolveVerifiedParaformer(validManifest, "D:\\Người dùng\\VietVoice Agent", deps))
  .resolves.toMatchObject({ modelId: "sherpa-onnx-paraformer-zh-2023-09-14" });
await expect(resolveVerifiedParaformer(corruptManifest, "D:\\VietVoice", deps))
  .rejects.toMatchObject({ code: "PARAFORMER_CHECKSUM_MISMATCH", fallbackEligible: true });
```

- [ ] **Step 2: Write failing process tests**

Inject a `spawnProcess` dependency. Assert the command is the verified `sherpa-onnx-offline.exe`; arguments include `--tokens=...`, `--paraformer=.../model.int8.onnx`, `--num-threads=4`, and the WAV path as a distinct array element; options include `shell: false`, `windowsHide: true`. Cover start error, non-zero exit, timeout, cancellation, malformed/truncated/oversized output, and successful paths containing spaces.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm --filter @vietvoice/agent test -- paraformer-manifest.test.ts paraformer-recognizer.test.ts`

Expected: FAIL because the manifest resolver and recognizer do not exist.

- [ ] **Step 4: Generalize checksum verification**

Keep `verifyBinaryChecksum` backward compatible and add `sha256File(path)` plus `verifyFileChecksum(path, expected, errorCode)`. Validate the expected digest with `/^[a-f\d]{64}$/i` before `timingSafeEqual`; map `ENOENT` to binary/model missing codes without exposing arbitrary absolute paths in public messages.

- [ ] **Step 5: Implement the manifest resolver**

Use this checked-in shape:

```json
{
  "schemaVersion": 1,
  "runtime": { "version": "1.13.8", "sourceUrl": "https://github.com/k2-fsa/sherpa-onnx/releases", "files": [] },
  "model": {
    "id": "sherpa-onnx-paraformer-zh-2023-09-14",
    "sourceUrl": "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-2023-09-14.tar.bz2",
    "license": "Apache-2.0",
    "files": []
  }
}
```

The task implementer must download the official v1.13.8 Windows x64 archive and official model archive, identify the executable/DLL/model/token files, compute each actual SHA-256 with `sha256sum`, and fill `files` entries `{ "path", "sizeBytes", "sha256" }`. If the official artifact layout differs, update only paths—never URLs, model ID, or the verification policy. Do not commit archives.

- [ ] **Step 6: Implement `ParaformerRecognizer`**

Constructor dependencies: verified paths, thread count, timeout, injected spawn and clock. `recognize(input, signal)` accepts a mono 16-bit WAV, runs the CLI once per supplied chunk, bounds stdout/stderr to 4 MiB/64 KiB, kills the entire child process on abort/timeout, awaits close, and returns Task 1’s normalized transcript. Map failures to stable `AsrFailure` codes.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `pnpm --filter @vietvoice/agent test -- paraformer-manifest.test.ts paraformer-recognizer.test.ts && pnpm --filter @vietvoice/agent typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/main/binaries.ts apps/agent/src/main/asr apps/agent/test/paraformer-manifest.test.ts apps/agent/test/paraformer-recognizer.test.ts apps/agent/resources/paraformer-manifest.json
git commit -m "feat(agent): run verified paraformer int8 locally"
```

### Task 3: Add VAD chunking, resumable checkpoints, and ASR cache identity

**Files:**

- Create: `apps/agent/src/main/asr/chunked-recognizer.ts`
- Create: `apps/agent/src/main/asr/silero-vad.ts`
- Create: `apps/agent/src/main/asr/asr-cache-identity.ts`
- Create: `apps/agent/test/chunked-recognizer.test.ts`
- Create: `apps/agent/test/silero-vad.test.ts`
- Create: `apps/agent/test/asr-cache-identity.test.ts`
- Modify: `apps/agent/src/main/jobs/json-stage-cache.ts`
- Modify: `apps/agent/src/main/jobs/local-job-executor.ts`
- Modify: `apps/agent/test/json-stage-cache.test.ts`
- Modify: `apps/agent/test/local-job-executor.test.ts`

- [ ] **Step 1: Write failing chunk/checkpoint tests**

Test ordered 30–60 second chunks with offsets, mixed-language transcript concatenation, abort between chunks, and resume after chunk 2 without re-decoding chunks 1–2. Use an injected `detectSpeechChunks` interface so tests need no ONNX model.

```ts
await expect(recognizer.recognize(input, signal)).rejects.toMatchObject({ name: "AbortError" });
expect(checkpoints.put).toHaveBeenCalledWith(expect.objectContaining({ chunkIndex: 1 }));
await resumed.recognize(input);
expect(local.decode).toHaveBeenCalledTimes(1);
```

Add `silero-vad.test.ts` with an injected `spawnProcess`. Assert the verified `sherpa-onnx-vad.exe`, verified `silero_vad.onnx`, and WAV path are separate arguments with `shell: false`; parse speech intervals from structured output; clamp them to media duration; merge gaps under 300 ms; split spans over 60 seconds; and cover malformed output, abort, timeout, and paths with spaces/non-ASCII characters.

- [ ] **Step 2: Write failing cache-identity tests**

Assert the identity changes for audio SHA-256, runtime version, model SHA-256, token SHA-256, VAD model SHA-256/config, language, thread-affecting decoder settings, or stage version; translation, voice, subtitle style, and export profile must not affect it.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm --filter @vietvoice/agent test -- silero-vad.test.ts chunked-recognizer.test.ts asr-cache-identity.test.ts json-stage-cache.test.ts local-job-executor.test.ts`

Expected: FAIL because chunking and cache identity are absent.

- [ ] **Step 4: Implement chunk recognition and checkpoints**

Implement `SileroVadDetector` as a bounded, cancellable, shell-free child-process adapter over the packaged sherpa VAD executable and verified Silero model. Define `SpeechChunk { index; path; startMs; endMs; sha256 }`; materialize each detected interval as mono 16-bit WAV through an injected FFmpeg cutter; and use checkpoint keys `${audioSha256}:${cacheIdentity}:${chunk.index}:${chunk.sha256}`. Persist only valid completed chunks via atomic JSON writes. On resume, validate checkpoint identity and chunk hash before reuse. Concatenate text with language-aware spacing and offset every segment into source-audio time.

- [ ] **Step 5: Version stage-cache keys**

Extend `StageCache.get/put` with optional `identity?: string`; persist it in `CacheEntry`. For `speech_recognition` and all downstream stages, a mismatched identity is a miss. Preserve behavior for unrelated stages and old entries.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `pnpm --filter @vietvoice/agent test -- silero-vad.test.ts chunked-recognizer.test.ts asr-cache-identity.test.ts json-stage-cache.test.ts local-job-executor.test.ts && pnpm --filter @vietvoice/agent typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/main/asr apps/agent/src/main/jobs apps/agent/test
git commit -m "feat(agent): checkpoint long paraformer recognition"
```

### Task 4: Implement local-first routing and wire the real stage runner

**Files:**

- Create: `apps/agent/src/main/asr/asr-router.ts`
- Create: `apps/agent/test/asr-router.test.ts`
- Modify: `apps/agent/src/main/cloud-ai-client.ts`
- Modify: `apps/agent/src/main/jobs/extract-audio.ts`
- Modify: `apps/agent/src/main/jobs/real-stage-runner.ts`
- Modify: `apps/agent/src/main/processing-runtime.ts`
- Modify: `apps/agent/test/cloud-ai-client.test.ts`
- Modify: `apps/agent/test/real-stage-runner.test.ts`
- Modify: `apps/agent/test/extract-audio.test.ts`

- [ ] **Step 1: Write failing router tests**

Cover: local success makes zero cloud calls; each eligible local error calls Gemini exactly once; Gemini failure calls OpenRouter; missing keys returns `ASR_FALLBACK_DISABLED`; abort/non-eligible user error never uploads; explicit cloud retry may opt in. Assert order with invocation counters.

```ts
expect(await router.recognize(input)).toMatchObject({ engine: "paraformer-local" });
expect(cloud.recognize).not.toHaveBeenCalled();

await router.recognize(inputWithLocalFailure);
expect(order).toEqual(["local", "gemini-audio", "openrouter-stt"]);
```

- [ ] **Step 2: Write failing stage/audio tests**

Change extraction expectation to mono, signed 16-bit, 16 kHz WAV (`-ac 1 -ar 16000 -c:a pcm_s16le`). Assert `speech_recognition` calls the injected `asr` dependency, not `cloud.recognize`, and that no asset upload occurs after local success.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm --filter @vietvoice/agent test -- asr-router.test.ts extract-audio.test.ts real-stage-runner.test.ts cloud-ai-client.test.ts`

Expected: FAIL because the local router is not wired and extraction still creates FLAC.

- [ ] **Step 4: Implement `AsrRouter`**

Expose `recognize(input, signal?, options?)`. Call local first. Only errors with `fallbackEligible === true` proceed. The cloud interface is `recognizeFallback(audioPath, language, provider: "gemini-audio" | "openrouter-stt")`; it uploads the audio lazily on the first fallback and reuses the short-lived asset URL for the second provider.

- [ ] **Step 5: Wire runtime configuration**

Read and validate:

```text
ASR_ENGINE=paraformer
ASR_FALLBACK_1=gemini
ASR_FALLBACK_2=openrouter
PARAFORMER_DEVICE=cpu
PARAFORMER_THREADS=4
PARAFORMER_TIMEOUT_MS=45000
PARAFORMER_RESOURCE_DIR=<Electron resources>/paraformer
```

Reject other primary engines and non-CPU devices at startup. Resolve packaged resources from `process.resourcesPath`; tests inject a resource directory. Replace `cloud.recognize` in `RealStageDependencies` with `asr.recognize`.

- [ ] **Step 6: Handle `auto` deterministically**

Because the chosen checkpoint is bilingual, run it once for `auto`. Detect Han/Latin script ratios from the completed transcript. Return `ASR_LANGUAGE_REVIEW_REQUIRED` only when text is empty/ambiguous; do not silently upload for ambiguity.

- [ ] **Step 7: Run focused tests and typecheck**

Run: `pnpm --filter @vietvoice/agent test -- asr-router.test.ts extract-audio.test.ts real-stage-runner.test.ts cloud-ai-client.test.ts && pnpm --filter @vietvoice/agent typecheck`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/main apps/agent/test
git commit -m "feat(agent): route speech recognition local first"
```

### Task 5: Replace DashScope/Groq with Gemini Audio and OpenRouter STT

**Files:**

- Create: `packages/provider-adapters/src/gemini-audio-provider.ts`
- Create: `packages/provider-adapters/src/openrouter-stt-provider.ts`
- Create: `packages/provider-adapters/src/audio-response.ts`
- Delete: `packages/provider-adapters/src/dashscope-provider.ts`
- Delete: `packages/provider-adapters/src/groq-transcription-provider.ts`
- Modify: `packages/provider-adapters/src/providers.ts`
- Modify: `packages/provider-adapters/src/index.ts`
- Modify: `packages/provider-adapters/src/providers.test.ts`
- Modify: `packages/provider-adapters/src/types.ts`
- Modify: `apps/api/src/ai/provider-ai-service.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/test/provider-ai-service.test.ts`
- Modify: `apps/api/test/server.test.ts`

- [ ] **Step 1: Replace provider tests first**

Delete tests that expect DashScope/Groq. Add mocked HTTP tests verifying Gemini receives audio as `inlineData` with an exact transcription instruction and OpenRouter receives supported audio content plus a model ID from server configuration. Both parsers must require a non-empty transcript and normalize returned timestamped JSON into `Transcript`.

- [ ] **Step 2: Add routing/config tests**

Assert `recognize(..., "gemini-audio")` uses only Gemini; `recognize(..., "openrouter-stt")` uses only OpenRouter; timeout is 45,000 ms; retry range rejects 0/4; and API construction works with neither, one, or both fallback keys. Translation and Gemini TTS remain available independently of ASR fallback keys.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm --filter @vietvoice/provider-adapters test && pnpm --filter @vietvoice/api test -- provider-ai-service.test.ts server.test.ts`

Expected: FAIL while the registry still exposes `funasr`/`groq-whisper`.

- [ ] **Step 4: Implement cloud ASR providers**

Use official Gemini `generateContent` audio input with a prompt that requests strict JSON `{ text, segments:[{startMs,endMs,text}] }`. Use OpenRouter’s documented audio input/transcription interface and configure `OPENROUTER_ASR_MODEL` server-side; never try arbitrary free models automatically unless they advertise audio input. Parse fenced/unfenced JSON defensively through `audio-response.ts`, enforce monotonic timestamps, and reject prose-only/empty responses.

- [ ] **Step 5: Make keys optional and service capabilities independent**

Change `ProviderSecrets` to optional `geminiApiKey`/`openRouterApiKey`; register only configured providers. Remove `funasrApiKey`, `groqApiKey`, and endpoint keys. In `createPrivateApi`, create the AI service when either cloud provider is configured and allow translation/TTS methods to return a stable provider-unavailable error if their required provider is absent.

- [ ] **Step 6: Preserve timeout/retry policy**

`ProviderAgentAiService.recognize` accepts an explicit fallback provider ID from the Agent; it does not add a second fallback internally. The Agent owns local → Gemini → OpenRouter order, preventing duplicate provider calls. `ProviderRouter` continues to enforce 45 seconds and 1–3 retries.

- [ ] **Step 7: Run tests, typecheck, and security scan**

Run: `pnpm --filter @vietvoice/provider-adapters test && pnpm --filter @vietvoice/api test && pnpm --filter @vietvoice/provider-adapters typecheck && pnpm --filter @vietvoice/api typecheck && pnpm security:scan`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A packages/provider-adapters apps/api
git commit -m "feat(api): add optional gemini and openrouter asr fallback"
```

### Task 6: Package pinned sherpa/model resources in Windows NSIS

**Files:**

- Create: `apps/agent/scripts/fetch-paraformer.mjs`
- Create: `apps/agent/scripts/verify-paraformer.mjs`
- Create: `apps/agent/test/paraformer-package.test.ts`
- Modify: `apps/agent/package.json`
- Modify: `apps/agent/electron-builder.yml`
- Modify: `apps/agent/resources/binaries.example.json`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml` if present; otherwise create `.github/workflows/windows-agent.yml`

- [ ] **Step 1: Write failing package-layout tests**

Parse `electron-builder.yml` and assert `extraResources` includes `resources/paraformer` → `paraformer`, including the offline and VAD executables, DLLs, manifest, `model.int8.onnx`, `tokens.txt`, and `silero_vad.onnx`. Test the verifier against a temporary good layout and corrupted ASR/VAD models. Assert no manifest value contains an unfinished checksum marker or a non-64-hex digest.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vietvoice/agent test -- paraformer-package.test.ts`

Expected: FAIL because packaging includes only `resources/bin/*.exe`.

- [ ] **Step 3: Implement deterministic fetch/verify scripts**

`fetch-paraformer.mjs` downloads only the pinned official URLs in Task 2, verifies the archive hashes recorded after the first authorized fetch, extracts to a temporary directory, copies the allowlisted runtime/model files, and atomically replaces `resources/paraformer`. `verify-paraformer.mjs` validates every file against the checked-in manifest and rejects extra executable/DLL files. Scripts must be cross-platform Node code and must not invoke a shell with interpolated paths.

- [ ] **Step 4: Update packaging and scripts**

Add `prepare:paraformer`, `verify:paraformer`, and make `dist:win` run verification before build. Include the entire verified resource tree through `extraResources`. Ignore downloaded archives and extracted staging directories, but do not ignore the manifest.

- [ ] **Step 5: Add Windows CI smoke job**

On `windows-latest`: install pnpm, fetch resources, verify resources, run Agent unit tests/typecheck, build `pnpm --filter @vietvoice/agent dist:win`, install silently into a temporary directory, and launch an Agent `--verify-runtime` mode that prints JSON and exits 0 only when FFmpeg, sherpa executable/DLLs, model, and tokens resolve and verify. Do not upload API keys.

- [ ] **Step 6: Run local verification**

Run: `pnpm --filter @vietvoice/agent test -- paraformer-package.test.ts && pnpm --filter @vietvoice/agent verify:paraformer`

Expected: PASS when artifacts are present; if current host cannot download an artifact, unit tests still pass and the exact failed official URL is recorded as an environmental blocker. Do not claim NSIS verified until the Windows job passes.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/scripts apps/agent/test/paraformer-package.test.ts apps/agent/package.json apps/agent/electron-builder.yml apps/agent/resources/paraformer-manifest.json apps/agent/resources/binaries.example.json .gitignore .github/workflows
git commit -m "build(agent): package verified paraformer runtime"
```

### Task 7: Remove obsolete providers, configuration, and documentation

**Files:**

- Modify: `.env.example`
- Modify: `docs/operations/provider-setup.md`
- Modify: `docs/operations/deployment.md`
- Modify: `docs/superpowers/specs/2026-09-19-vietvoice-hybrid-mvp-design.md`
- Modify: `docs/superpowers/plans/2026-09-19-vietvoice-hybrid-mvp-implementation.md`
- Create: `scripts/scan-obsolete-asr.mjs`
- Modify: `package.json`
- Modify: `scripts/scan-client-secrets.mjs`
- Create: `test/obsolete-asr-scan.test.ts`

- [ ] **Step 1: Add failing obsolete-provider scan**

Scan runtime code, environment examples, operational docs, UI, and build outputs for case-insensitive `alibaba`, `aliyun`, `dashscope`, `DASHSCOPE_API_KEY`, `funasrApiKey`, `groq-whisper`, and `GROQ_API_KEY`. Exclude Git history and the dated superseded design/plan only after those documents have a prominent superseded notice pointing to this plan/spec.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run test/obsolete-asr-scan.test.ts`

Expected: FAIL and list current provider/runtime/doc references.

- [ ] **Step 3: Replace environment and operations documentation**

Document local settings, model storage/checksum verification, optional `GEMINI_API_KEY`, optional `OPENROUTER_API_KEY`, `OPENROUTER_ASR_MODEL`, 45-second timeout, retries 1–3, fallback privacy warning, and offline behavior. State that no audio leaves the computer on local success.

- [ ] **Step 4: Mark old design/plan recognition sections superseded**

Do not rewrite historical task outcomes. Add a top-level notice that all cloud FunASR/Groq recognition instructions are superseded by the 2026-09-21 spec/plan and must not be executed.

- [ ] **Step 5: Extend secret scanning**

Assert web/Agent source and production bundles contain no values of `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or configured key fixtures. Add `security:scan:asr` and include it in `security:scan`.

- [ ] **Step 6: Run scans and full static verification**

Run: `pnpm vitest run test/obsolete-asr-scan.test.ts && pnpm security:scan && pnpm typecheck`

Expected: PASS; any obsolete identifier is confined to the explicitly superseded historical documents or migration test denylist.

- [ ] **Step 7: Commit**

```bash
git add .env.example docs package.json scripts test
git commit -m "docs: remove obsolete cloud asr setup"
```

### Task 8: Run Chinese local E2E and fallback contract E2E

**Files:**

- Create: `apps/agent/test/e2e/chinese-paraformer.e2e.test.ts`
- Create: `apps/agent/test/e2e/asr-fallback.e2e.test.ts`
- Create: `apps/agent/test/e2e/helpers.ts`
- Modify: `apps/agent/package.json`
- Create: `docs/operations/local-paraformer-e2e.md`

- [ ] **Step 1: Write gated E2E tests**

The local test runs only when `VIETVOICE_E2E_CHINESE_VIDEO` and verified resources exist; otherwise it reports an explicit skip. It must spawn FFmpeg and sherpa with outbound network disabled by the test harness, then assert:

```ts
expect(result.text.length).toBeGreaterThan(20);
expect((result.text.match(/[\u3400-\u9fff]/gu) ?? []).length / result.text.length).toBeGreaterThan(0.25);
expect(result.segments.length).toBeGreaterThan(0);
expect(result.segments.every(monotonicAndWithinSourceDuration)).toBe(true);
expect(result.engine).toBe("paraformer-local");
expect(assetServer.uploadCount).toBe(0);
```

The fallback E2E uses a deliberately invalid local binary path and mock Gemini/OpenRouter HTTP servers: local failure → Gemini success, then local failure → Gemini timeout/error → OpenRouter success. It also tests both keys absent → `ASR_FALLBACK_DISABLED` without a second upload.

- [ ] **Step 2: Run tests and verify initial failure**

Run:

```bash
VIETVOICE_E2E_CHINESE_VIDEO='/workspace/scratch/89dcf499da31/upload/Vd Trung.mp4' pnpm --filter @vietvoice/agent test:e2e:asr
```

Expected before final wiring: FAIL on missing E2E script or incomplete runtime setup.

- [ ] **Step 3: Add the E2E script and documentation**

Add `test:e2e:asr: vitest run test/e2e/*.e2e.test.ts --testTimeout=180000`. Document prerequisites, the exact environment variable, network-off local assertion, expected generated transcript/SRT paths, how to inspect logs, and cleanup. The source video remains read-only and outside Git.

- [ ] **Step 4: Execute the authorized Chinese sample locally**

Use:

```bash
VIETVOICE_E2E_CHINESE_VIDEO='/workspace/scratch/89dcf499da31/upload/Vd Trung.mp4' \
ASR_ENGINE=paraformer PARAFORMER_DEVICE=cpu PARAFORMER_THREADS=4 \
pnpm --filter @vietvoice/agent test:e2e:asr
```

Expected: the 61-second video yields a non-empty timestamped Chinese transcript, generated SRT, `engine: paraformer-local`, and zero cloud uploads. Record duration, segment count, transcript character count, model hash, and runtime version in the test artifact; do not record secrets.

- [ ] **Step 5: Run complete verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm security:scan
```

Expected: all PASS. Then run `git status --short` and confirm only intended E2E result artifacts are ignored.

- [ ] **Step 6: Request code review and fix findings**

Use `superpowers:requesting-code-review`. Review specifically against every item under **Review Focus**, the approved spec, fallback privacy, provider-call order, and Windows packaging. Apply accepted findings with new failing regression tests.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/test/e2e apps/agent/package.json docs/operations/local-paraformer-e2e.md
git commit -m "test(agent): verify chinese paraformer pipeline end to end"
```

### Task 9: Final Windows NSIS acceptance

**Files:**

- Modify only files required by failures found during Windows acceptance
- Create: `docs/operations/windows-acceptance-report.md`

- [ ] **Step 1: Install on clean Windows 10/11 x64 CPU-only environment**

Build the NSIS artifact from the reviewed commit. Install to a path containing spaces and Vietnamese characters. Run `VietVoice Agent --verify-runtime`; require verified FFmpeg, ffprobe, sherpa runtime/DLLs, model, tokens, and manifest.

- [ ] **Step 2: Run the authorized local E2E without cloud keys**

Set neither Gemini nor OpenRouter key. Process the Chinese sample end-to-end and require transcript, Vietnamese translation through the separately configured translation service when available, subtitles, render progress, final MP4, and downloadable/exportable artifact. ASR itself must succeed with network unavailable.

- [ ] **Step 3: Exercise recovery**

Cancel during a later recognition chunk on a long-video fixture, restart Agent, and confirm completed chunks are reused. Corrupt a copied model, confirm `PARAFORMER_CHECKSUM_MISMATCH`, restore it, retry, and confirm no earlier media stage reruns.

- [ ] **Step 4: Record evidence**

In `windows-acceptance-report.md`, record OS build, CPU/RAM, installer SHA-256, Agent version, sherpa runtime/model hashes, sample duration, recognition duration, segment count, cache-resume result, final output hash, and pass/fail for each acceptance item. Never include keys, raw tokens, or signed asset URLs.

- [ ] **Step 5: Run verification-before-completion**

Use `superpowers:verification-before-completion`; rerun all relevant tests/scans and inspect the NSIS report before claiming completion.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: complete windows paraformer acceptance"
```
