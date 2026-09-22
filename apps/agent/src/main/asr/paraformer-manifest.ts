import { win32 } from "node:path";
import { verifyFileChecksum } from "../binaries.js";
import type { AsrFailure } from "./types.js";

export interface ManifestFile {
  path: string;
  sizeBytes: number;
  sha256: string;
  role: "executable" | "dll" | "model" | "tokens" | "vad-executable" | "vad-model";
}

export interface ParaformerManifest {
  schemaVersion: 1;
  runtime: { version: string; sourceUrl: string; files: ManifestFile[] };
  model: { id: string; sourceUrl: string; license: string; files: ManifestFile[] };
}

export interface VerifiedParaformer {
  executablePath: string;
  modelPath: string;
  tokensPath: string;
  modelId: string;
  runtimeVersion: string;
  modelSha256: string;
  tokensSha256: string;
}

interface ManifestDependencies {
  verify(path: string, sha256: string, errorCode: string): Promise<void>;
}

export async function resolveVerifiedParaformer(
  manifest: ParaformerManifest,
  resourceDirectory: string,
  dependencies: ManifestDependencies = { verify: verifyFileChecksum },
): Promise<VerifiedParaformer> {
  validateManifest(manifest);
  for (const file of [...manifest.runtime.files, ...manifest.model.files]) {
    try {
      await dependencies.verify(win32.join(resourceDirectory, file.path), file.sha256, "CHECKSUM_MISMATCH");
    } catch (error) {
      const missing = (error as { code?: string }).code === "FILE_MISSING";
      const code = missing
        ? file.role === "executable" || file.role === "dll" ? "PARAFORMER_BINARY_MISSING" : "PARAFORMER_MODEL_MISSING"
        : "PARAFORMER_CHECKSUM_MISMATCH";
      const message = code === "PARAFORMER_BINARY_MISSING" ? "Thiếu chương trình nhận dạng Paraformer."
        : code === "PARAFORMER_MODEL_MISSING" ? "Thiếu tệp nhận dạng Paraformer."
          : "Tệp Paraformer không vượt qua kiểm tra toàn vẹn.";
      throw failure(code, message);
    }
  }
  const executable = requiredRole(manifest.runtime.files, "executable");
  const model = requiredRole(manifest.model.files, "model");
  const tokens = requiredRole(manifest.model.files, "tokens");
  return {
    executablePath: win32.join(resourceDirectory, executable.path),
    modelPath: win32.join(resourceDirectory, model.path),
    tokensPath: win32.join(resourceDirectory, tokens.path),
    modelId: manifest.model.id,
    runtimeVersion: manifest.runtime.version,
    modelSha256: model.sha256,
    tokensSha256: tokens.sha256,
  };
}

function validateManifest(manifest: ParaformerManifest): void {
  const all = [...(manifest.runtime?.files ?? []), ...(manifest.model?.files ?? [])];
  const valid = manifest.schemaVersion === 1 && manifest.runtime?.version === "1.13.8"
    && manifest.runtime.sourceUrl.startsWith("https://github.com/k2-fsa/sherpa-onnx/releases")
    && manifest.model?.id === "sherpa-onnx-paraformer-zh-2023-09-14"
    && manifest.model.sourceUrl.startsWith("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/")
    && manifest.model.license === "Apache-2.0" && all.length > 0
    && all.every((file) => file.path && file.sizeBytes > 0 && /^[a-f\d]{64}$/i.test(file.sha256));
  if (!valid) throw failure("PARAFORMER_CHECKSUM_MISMATCH", "Manifest Paraformer không hợp lệ.");
  for (const role of ["executable", "dll", "model", "tokens"] as const) {
    if (!all.some((file) => file.role === role)) throw failure("PARAFORMER_MODEL_MISSING", "Manifest Paraformer thiếu thành phần bắt buộc.");
  }
}

function requiredRole(files: ManifestFile[], role: ManifestFile["role"]): ManifestFile {
  const file = files.find((candidate) => candidate.role === role);
  if (!file) throw failure("PARAFORMER_MODEL_MISSING", "Manifest Paraformer thiếu thành phần bắt buộc.");
  return file;
}

function failure(code: AsrFailure["code"], publicMessage: string): AsrFailure {
  return Object.assign(new Error(code), { code, publicMessage, fallbackEligible: true }) as AsrFailure;
}
