# VietVoice Hybrid Studio — MVP Design

**Date:** 2026-09-19  
**Status:** Approved design  
**Audience:** Product owner and implementation team

## 1. Product goal

Build a private, production-capable MVP for translating, subtitling, dubbing, rendering, and publishing batches of videos. The product combines a cloud Web Dashboard with a Windows 10/11 x64 Electron Agent. Heavy media work runs on the user's computer without requiring a GPU; AI recognition, translation, context analysis, role assignment, and fallback voice generation use cloud services.

The intended users own or are authorized to process and publish the source media. Platform integrations must use official or otherwise authorized access methods and must not rely on password, cookie, or browser-session extraction.

## 2. MVP scope

The MVP includes:

- Email or Google sign-in.
- Private per-user projects and paired Windows Agents.
- Project creation from URLs, playlists, channels, multiple files, or a local folder.
- Source discovery for YouTube, Douyin, and Hongguo, subject to platform access and user rights.
- Episode detection, metadata extraction, duration filtering, search, selection, and duplicate detection.
- A resumable one-to-three-lane processing queue.
- Two processing modes: translated subtitles only, or translated subtitles plus dubbing.
- Editable transcript, translation, subtitle style, speaker roles, and voices.
- Modular cached pipeline stages with background progress, retry, cancellation, and recovery.
- Export presets for original, vertical, square, landscape, and short-form video.
- Project history, continuation, duplication, rename, deletion, and re-export.
- TikTok and Facebook Pages/Reels publishing through official APIs when the connected account has the required permissions.
- Manual-ready export packages when a platform API cannot publish.

The MVP excludes team collaboration, billing, macOS/Linux Agents, a professional multitrack timeline, and unsupported attempts to bypass platform controls.

## 3. System architecture

### 3.1 Components

1. **Web Dashboard** — Next.js and TypeScript. Provides authentication, projects, source review, pipeline configuration, queue monitoring, editing, history, export, and publishing.
2. **Cloud API** — Node.js and TypeScript. Enforces authorization, stores secrets, orchestrates jobs and fallbacks, issues short-lived file URLs, handles social OAuth, and communicates with Agents.
3. **Database and authentication** — Supabase Auth and PostgreSQL. Stores users, projects, assets, pipeline stages, cache records, Agents, jobs, publishing accounts, and audit logs.
4. **Queue** — Redis and BullMQ. Runs long cloud tasks outside request/response cycles, tracks retries, and prevents UI blocking.
5. **Temporary object storage** — Cloudflare R2. Stores compressed audio, subtitle assets, generated voice segments, thumbnails, and other explicitly required intermediate files with expiration policies.
6. **Windows Agent** — Electron and TypeScript with local SQLite. Scans local folders, probes media, downloads authorized sources, runs FFmpeg, renders exports, writes files locally, and reports progress.
7. **Media tools** — FFmpeg/ffprobe and yt-dlp, packaged and versioned with the Agent or installed through its controlled dependency manager.

### 3.2 Trust boundaries

- AI and social API keys remain encrypted on the cloud server and are never returned to the browser or Electron Agent.
- The Agent authenticates with a one-time pairing code and receives a revocable device credential.
- The Agent opens an outbound encrypted connection; the user does not expose a local port.
- Original and completed videos remain local by default. Only the minimum necessary compressed audio and intermediate artifacts are uploaded.
- Temporary cloud objects expire automatically. The UI displays retention policy and allows early cleanup.
- Every user-facing data access is scoped to the authenticated user.

## 4. Primary user journeys

### 4.1 Dashboard

The first screen displays recent projects with thumbnail, name, total duration, video count, current stage, progress, last update, and status. Available actions are Create new project, Continue editing, Duplicate, Rename, Delete with confirmation, Re-export, and Open AI Pipeline.

### 4.2 Step 1 — Add and scan sources

The user may paste one or many video, playlist, or channel URLs; select multiple local files; or select a local folder. The Agent and source connectors produce normalized source records containing title, detected episode number, duration, thumbnail, platform, source identifier, local/download status, and duplicate fingerprint.

Source connectors are isolated modules so platform-specific changes do not affect the processing pipeline. Unsupported, private, unavailable, or unauthorized sources return a clear error without attempting access circumvention.

### 4.3 Step 2 — Review and queue videos

The source list supports search by title or episode, duration and status filters, individual selection, episode-range selection, select all, and skip previously processed duplicates. Adding selections creates immutable job inputs and places them in a persistent queue.

The user chooses one, two, or three concurrent processing lanes. Download, cloud AI, and local render concurrency are separately limited to prevent memory, bandwidth, and quota exhaustion.

### 4.4 Step 3 — Choose processing mode

**Subtitles mode:** extract audio, recognize speech, detect language, build transcript, generate subtitles, translate, optionally detect and blur burned-in subtitles, render translated subtitles, and export.

**Subtitles and dubbing mode:** run the subtitle flow, assign speakers and voices, generate voice segments, align them to timestamps, mix with retained music/effects, render, and export.

Completed exports appear immediately in project history with play, open folder, download, re-edit, re-export, and publish actions.

## 5. Modular AI and media pipeline

The canonical stages are:

1. Video Input
2. Media Processing
3. Audio Extraction
4. Speech Recognition
5. Language Detection
6. Transcript
7. Subtitle Generation
8. Translation
9. Voice Generation
10. Audio Sync
11. Video Rendering
12. Export

Each stage has a versioned input schema, output schema, status, progress, attempt count, log summary, error code, dependency list, cache key, start/end time, and checkpoint. A stage is eligible to run only when its dependencies have valid outputs.

Cache keys include input artifact hashes, normalized configuration, model/provider identifier, prompt or glossary version, and pipeline stage version. Downstream stages are invalidated only when a dependency changes.

Examples:

- Editing translation reruns subtitle generation and affected downstream stages, but not audio extraction or recognition.
- Changing a voice reruns voice generation, audio sync, rendering, and export.
- Changing subtitle style reruns rendering and export only.
- Changing resolution or video quality reruns rendering and export only.

## 6. AI providers and routing

### 6.1 Recognition

- Simplified Chinese primary: FunASR Paraformer through a cloud service.
- English primary: Groq Whisper API.
- Language is inferred from source metadata and a short audio sample, then verified from recognition output.
- Long audio is divided into timestamped chunks with overlap. Chunk outputs are normalized and merged without duplicating overlap text.
- WhisperX and pyannote are explicitly excluded.

### 6.2 Translation, context, and speaker roles

- Primary: Gemini.
- Fallback: OpenRouter.
- Translation operates on scene-aware chunks with overlapping context, not isolated sentences.
- Each project may define character names, forms of address, glossary terms, protected names, and style instructions.
- Speaker-role inference uses transcript turns and context. Users can edit roles before voice generation.

### 6.3 Voice generation

- Primary: Edge TTS.
- Fallback: Gemini TTS.
- Each role can map to a distinct voice.
- The system may adjust speech rate within safe limits to fit timing.
- Users can retain background music/effects and control original-dialogue ducking or replacement.

### 6.4 Retry and fallback policy

1. Call only the primary provider first.
2. Mark an attempt timed out after 45 seconds unless the provider offers a reliable asynchronous status endpoint.
3. Retry one to three times according to project settings with exponential backoff and jitter.
4. Use the fallback only after the primary has failed, timed out, or exhausted quota.
5. OpenRouter may rotate through an administrator-approved list of free models.
6. When all eligible models are unavailable or quota-limited, pause the job in an actionable state rather than loop.
7. Cache successful provider responses to prevent duplicate calls and avoid unnecessary cost.

## 7. Rendering and export

Users select:

- Resolution: original, 720p, 1080p, or custom.
- Aspect ratio: original, 9:16, 1:1, or 16:9.
- Quality: economy, balanced, or high.
- Preset: Original, Vertical, Square, Landscape, or Short-form.
- Frame behavior: crop, fit with blurred background, or preserve original.

Rendering occurs in the Agent with FFmpeg. Progress is derived from processed timestamp versus expected duration and includes percentage, elapsed time, and estimated remaining time. A canceled or interrupted render leaves a clean checkpoint and removes incomplete output safely.

## 8. Background jobs, performance, and cleanup

- All tasks longer than an ordinary UI interaction run in background jobs.
- Web requests acknowledge commands quickly and the UI receives progress over WebSocket or server-sent events.
- Video and audio are processed as streams or chunks where possible.
- The Agent persists its local queue and stage outputs in SQLite so restart, sleep, or network loss does not erase work.
- Cloud and local temporary files have reference counts and expiration timestamps.
- Cleanup runs after successful export, project deletion, and scheduled retention sweeps.
- The UI remains responsive while jobs run and provides Retry, Cancel, Pause, Resume, and an understandable error message.

## 9. Error model

Errors use stable machine codes and localized user messages. Required categories include invalid/unsupported source, authorization required, missing local file, corrupted media, insufficient disk space, Agent offline, timeout, provider unavailable, invalid API key, quota exhausted, rate limited, invalid AI response, render failure, and publish permission failure.

Each error reports the failed stage, whether retry is safe, whether fallback is available, and the recommended user action. Raw secrets, tokens, request bodies, and personal data are redacted from logs.

## 10. Project history and lifecycle

Projects retain their source manifest, pipeline configuration, stage outputs, edits, exports, and publish history. Duplicate creates a new project referencing reusable cached artifacts when ownership and retention allow. Rename changes only project metadata. Delete requires confirmation, cancels queued work, removes cloud records and temporary objects, and instructs the Agent to remove project-local cache according to the user's selection.

Re-export creates a new export record without overwriting an existing completed file unless the user explicitly confirms replacement.

## 11. Social publishing

The MVP supports TikTok and Facebook Pages/Reels through official OAuth and publishing APIs. The user chooses a completed export, target account, caption, hashtags, visibility, and immediate or scheduled publication. A confirmation screen shows the video, destination account, copy, and schedule before submission.

Publishing states are Queued, Uploading, Platform processing, Published, and Failed. Successful records store platform post ID, public URL when available, timestamp, and final settings. If the application or account lacks a required platform permission, the product generates a ready-to-upload video and metadata package rather than using cookies, passwords, or browser automation.

## 12. Principal data entities

- User
- Project
- AgentDevice
- SourceCollection
- VideoAsset
- PipelineRun
- StageRun
- Artifact
- CacheEntry
- TranscriptSegment
- TranslationSegment
- SpeakerRole
- VoiceProfile
- ExportProfile
- ExportRecord
- SocialConnection
- PublishJob
- AuditEvent

Every tenant-owned entity includes an owner identifier. Mutable records use optimistic concurrency or version numbers to prevent edits from silently overwriting background results.

## 13. Screens

1. Sign in
2. Recent-project Dashboard
3. Create project and add sources
4. Source scan and episode selection
5. AI Pipeline configuration
6. Queue and stage progress
7. Transcript, translation, subtitle, and role editor
8. Voice and audio-sync settings
9. Render and export settings
10. Project history
11. TikTok/Facebook publishing
12. Agent, provider, and connected-account settings

The UI is Vietnamese-first, desktop-oriented for editing, responsive for monitoring, keyboard accessible, and never blocks on background media work.

## 14. Testing strategy

- Unit tests for stage contracts, dependency invalidation, cache keys, retry/fallback decisions, chunk merging, and export-profile mapping.
- Integration tests for authentication, authorization, database transactions, queue behavior, R2 lifecycle, Agent protocol, OAuth callbacks, and provider adapters.
- Provider contract tests use recorded redacted fixtures and mock servers to avoid quota use.
- End-to-end tests cover Chinese and English videos, short and long inputs, folder batches, playlists, duplicate episodes, partial failure, timeout after 45 seconds, quota exhaustion, Agent restart, network loss, and resume.
- Render tests cover original, 9:16, 1:1, and 16:9 outputs at multiple quality levels and verify audio/subtitle presence and duration tolerance.
- Security tests verify that browser bundles, network responses, Agent messages, logs, and crash reports never expose server API keys.
- Installer smoke tests run on Windows 10 and Windows 11 x64.

## 15. Acceptance criteria

The MVP is acceptable when an authenticated user can pair a Windows Agent, create a project, ingest at least one authorized local or URL source, select videos, run either processing mode, observe live stage and render progress, recover a failed/interrupted run without repeating valid upstream stages, edit and re-export from cached results, and obtain a playable output in the selected format.

For supported connected accounts with approved API permissions, the user can publish to TikTok or Facebook and view the final publish state. When permissions are unavailable, the system clearly explains the limitation and produces a manual-ready export package.

## 16. Delivery sequence

1. Shared schemas, authentication, project database, and Dashboard shell.
2. Electron Agent pairing, local persistence, media probe, and FFmpeg rendering.
3. Source ingestion and normalized episode-selection flow.
4. Modular queue, stage engine, cache, checkpoints, and progress protocol.
5. Recognition, translation, subtitle, voice, and audio-sync provider adapters.
6. Transcript/translation/role editor and export presets.
7. Project history, duplication, cleanup, and re-export.
8. TikTok and Facebook OAuth/publishing adapters.
9. Windows packaging, security review, end-to-end reliability testing, and private release.

