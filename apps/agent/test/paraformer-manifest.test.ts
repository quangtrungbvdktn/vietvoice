import { describe, expect, it, vi } from "vitest";
import { resolveVerifiedParaformer, type ParaformerManifest } from "../src/main/asr/paraformer-manifest.js";

const digest = "a".repeat(64);
const validManifest: ParaformerManifest = {
  schemaVersion: 1,
  runtime: {
    version: "1.13.8",
    sourceUrl: "https://github.com/k2-fsa/sherpa-onnx/releases",
    files: [
      { path: "bin/sherpa-onnx-offline.exe", sizeBytes: 10, sha256: digest, role: "executable" },
      { path: "bin/onnxruntime.dll", sizeBytes: 20, sha256: digest, role: "dll" },
      { path: "bin/sherpa-onnx-vad.exe", sizeBytes: 21, sha256: digest, role: "vad-executable" },
    ],
  },
  model: {
    id: "sherpa-onnx-paraformer-zh-2023-09-14",
    sourceUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-2023-09-14.tar.bz2",
    license: "Apache-2.0",
    files: [
      { path: "model/model.int8.onnx", sizeBytes: 30, sha256: digest, role: "model" },
      { path: "model/tokens.txt", sizeBytes: 40, sha256: digest, role: "tokens" },
      { path: "model/silero_vad.onnx", sizeBytes: 41, sha256: digest, role: "vad-model" },
    ],
  },
};

describe("resolveVerifiedParaformer", () => {
  it("verifies every runtime and model file under a Unicode Windows resource path", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    await expect(resolveVerifiedParaformer(validManifest, "D:\\Người dùng\\VietVoice Agent", { verify }))
      .resolves.toMatchObject({
        modelId: "sherpa-onnx-paraformer-zh-2023-09-14",
        executablePath: expect.stringContaining("sherpa-onnx-offline.exe"),
        modelPath: expect.stringContaining("model.int8.onnx"),
        tokensPath: expect.stringContaining("tokens.txt"),
        vadExecutablePath: expect.stringContaining("sherpa-onnx-vad.exe"),
        vadModelPath: expect.stringContaining("silero_vad.onnx"),
        vadModelSha256: digest,
      });
    expect(verify).toHaveBeenCalledTimes(6);
  });

  it("rejects a manifest without a required DLL", async () => {
    const manifest = structuredClone(validManifest);
    manifest.runtime.files = manifest.runtime.files.filter((file) => file.role !== "dll");
    await expect(resolveVerifiedParaformer(manifest, "D:\\VietVoice", { verify: vi.fn() }))
      .rejects.toMatchObject({ code: "PARAFORMER_MODEL_MISSING", fallbackEligible: true });
  });

  it("rejects invalid checksums before touching the filesystem", async () => {
    const manifest = structuredClone(validManifest);
    manifest.model.files[0]!.sha256 = "not-a-digest";
    const verify = vi.fn();
    await expect(resolveVerifiedParaformer(manifest, "D:\\VietVoice", { verify }))
      .rejects.toMatchObject({ code: "PARAFORMER_CHECKSUM_MISMATCH", fallbackEligible: true });
    expect(verify).not.toHaveBeenCalled();
  });

  it("maps a verified file mismatch to the stable checksum error", async () => {
    const verify = vi.fn().mockRejectedValue(Object.assign(new Error("mismatch"), { code: "CHECKSUM_MISMATCH" }));
    await expect(resolveVerifiedParaformer(validManifest, "D:\\VietVoice", { verify }))
      .rejects.toMatchObject({ code: "PARAFORMER_CHECKSUM_MISMATCH", fallbackEligible: true });
  });

  it.each([
    ["bin/sherpa-onnx-offline.exe", "PARAFORMER_BINARY_MISSING"],
    ["model/model.int8.onnx", "PARAFORMER_MODEL_MISSING"],
  ])("maps a missing %s to %s", async (missingPath, expectedCode) => {
    const verify = vi.fn(async (path: string) => {
      if (path.endsWith(missingPath.replaceAll("/", "\\"))) {
        throw Object.assign(new Error("missing"), { code: "FILE_MISSING" });
      }
    });
    await expect(resolveVerifiedParaformer(validManifest, "D:\\VietVoice", { verify }))
      .rejects.toMatchObject({ code: expectedCode, fallbackEligible: true });
  });
});
