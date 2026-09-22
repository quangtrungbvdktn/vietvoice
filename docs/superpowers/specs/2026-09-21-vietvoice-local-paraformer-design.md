# VietVoice Local Paraformer ASR — Design Amendment

**Date:** 2026-09-21  
**Status:** Approved
**Supersedes:** Recognition provider decisions in `2026-09-19-vietvoice-hybrid-mvp-design.md`

## 1. Goal

Remove Alibaba Cloud and DashScope completely from VietVoice. Speech recognition becomes local-first and free to run: the Windows Agent uses sherpa-onnx with quantized Paraformer INT8 models on CPU. Gemini Audio and OpenRouter STT remain optional cloud fallbacks and are called only after local recognition fails or the required local model is unavailable.

The design continues to target Windows 10/11 x64 without a GPU. WhisperX and pyannote remain excluded.

## 2. Recognition architecture

The Windows Agent owns the primary ASR pipeline:

1. FFmpeg extracts 16 kHz mono FLAC or WAV.
2. Silero VAD divides long audio into bounded speech chunks.
3. sherpa-onnx loads a Paraformer INT8 ONNX model with the CPU execution provider.
4. Each chunk is decoded locally.
5. VAD boundaries provide coarse segment timestamps. Model token timestamps are used only when the selected checkpoint reliably exposes them.
6. The Agent normalizes chunks into the existing transcript segment schema and caches the result.

No audio is uploaded when local Paraformer succeeds.

## 3. Language handling

VietVoice supports Simplified Chinese and English source audio.

- Chinese and English use the verified bilingual `sherpa-onnx-paraformer-zh-2023-09-14` INT8 checkpoint, which exposes token timestamps and avoids loading two model families.
- A project may explicitly select `zh`, `en`, or `auto`.
- In `auto`, the Agent decodes a short initial sample and evaluates script ratio, empty output, and decoder metadata. If the result is ambiguous, the job pauses for a user language choice rather than silently choosing a cloud service.

Model files, token files, VAD files, versions, licenses, download sources, sizes, and SHA-256 checksums are recorded in the Agent binary manifest. A model is never executed before checksum verification.

## 4. Provider order and fallback

The recognition order is fixed:

1. `paraformer-local`
2. `gemini-audio`
3. `openrouter-stt`

Fallback is eligible only when the preceding engine:

- is missing or fails checksum verification;
- cannot start;
- times out according to the local stage policy;
- crashes or returns an invalid/empty transcript after configured retries; or
- reports an unsupported input.

Low subjective transcript quality does not automatically upload audio. The user may explicitly request cloud retry from the editor.

Gemini and OpenRouter retain the existing 45-second cloud timeout and one-to-three retry policy. OpenRouter is called only after Gemini fails, times out, or exhausts quota. When both fail, the job pauses with Retry and Change language actions.

## 5. Configuration

The supported configuration is:

```env
ASR_ENGINE=paraformer
ASR_FALLBACK_1=gemini
ASR_FALLBACK_2=openrouter
PARAFORMER_DEVICE=cpu
PARAFORMER_THREADS=4
PARAFORMER_MODEL_DIR=resources/models/sherpa-onnx-paraformer-zh-2023-09-14
PARAFORMER_VAD_MODEL=resources/models/silero_vad.onnx
```

`DASHSCOPE_API_KEY`, the DashScope endpoint, the DashScope adapter, and all Alibaba setup documentation are removed. `GEMINI_API_KEY` and `OPENROUTER_API_KEY` remain server-side and optional. If they are absent, local ASR still works and the UI reports that cloud fallback is disabled.

## 6. Agent integration

The Agent adds a local Paraformer adapter with four responsibilities:

- validate binary and model manifests;
- construct process arguments without a shell;
- stream structured JSON results from sherpa-onnx;
- map process failures to safe localized error codes.

The adapter never accepts executable arguments directly from project or transcript content. `shell: false` remains mandatory. Process output is bounded to prevent unbounded memory use, and cancellation terminates the child process.

The existing modular stage cache includes ASR engine ID, binary version, model hashes, language, VAD configuration, audio hash, and stage version. Changing translation, voice, subtitle style, or export profile does not rerun local ASR.

## 7. Packaging and model lifecycle

The NSIS package includes or downloads through a controlled installer:

- sherpa-onnx Windows x64 runtime and required DLLs;
- bilingual Chinese–English Paraformer INT8 model and tokens;
- Silero VAD ONNX model;
- FFmpeg and ffprobe.

The default private MVP favors an offline-capable package containing the required models. If installer size becomes unacceptable, models may be downloaded after installation only from pinned official release URLs with SHA-256 verification and a visible progress/retry UI.

Model upgrades are versioned. Existing stage caches remain associated with their original model hash and are not relabeled as outputs of the new model.

## 8. Cloud fallback transport

Gemini Audio and OpenRouter STT are accessed through the Cloud API so keys never reach the browser or Agent. Only fallback uploads use the existing short-lived audio asset URL. Audio is deleted on expiry or earlier after the fallback result is acknowledged.

The server no longer exposes or initializes a DashScope provider. The generic asset upload route remains because Gemini/OpenRouter need audio input during fallback.

## 9. Errors and recovery

New stable errors include:

- `PARAFORMER_BINARY_MISSING`
- `PARAFORMER_MODEL_MISSING`
- `PARAFORMER_CHECKSUM_MISMATCH`
- `PARAFORMER_START_FAILED`
- `PARAFORMER_TIMEOUT`
- `PARAFORMER_OUTPUT_INVALID`
- `ASR_LANGUAGE_REVIEW_REQUIRED`
- `ASR_FALLBACK_DISABLED`

Failed local attempts are not cached as completed. Valid transcript chunks are checkpointed so a long video can resume without decoding acknowledged chunks again.

## 10. Testing and acceptance

Required tests:

- process-plan tests prove `shell: false` and reject missing/unverified models;
- fixture tests normalize Chinese and English sherpa-onnx JSON output;
- cancellation and timeout tests terminate the local process;
- routing tests prove Gemini is not called when local ASR succeeds;
- routing tests prove Gemini precedes OpenRouter and both remain optional;
- cache tests prove model or audio hash changes invalidate recognition;
- secret scans prove no cloud key enters Agent or browser bundles;
- Windows 10/11 installer smoke tests verify binary/DLL/model discovery;
- an authorized Chinese video completes locally with network disabled;
- a forced local failure completes through Gemini, and a forced Gemini failure proceeds to OpenRouter.

The amendment is accepted when VietVoice can produce a timestamped Chinese transcript on a CPU-only Windows machine with `ASR_ENGINE=paraformer`, no Alibaba configuration, and no network access; Alibaba identifiers are absent from runtime code, environment documentation, UI, and client bundles.
