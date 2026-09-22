import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyResourceTree } from "../scripts/verify-paraformer.mjs";

describe("packaged Paraformer resources", () => {
  it("includes the verified resource tree in electron-builder", async () => {
    const config = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
    expect(config).toContain("from: resources/paraformer");
    expect(config).toContain("to: paraformer");
    expect(config).toContain("paraformer-manifest.json");
  });

  it("verifies every declared file and rejects corruption", async () => {
    const root = await mkdtemp(join(tmpdir(), "vietvoice-paraformer-package-"));
    await mkdir(join(root, "bin"), { recursive: true });
    await mkdir(join(root, "model"), { recursive: true });
    const files = [
      ["bin/sherpa-onnx-offline.exe", "exe", "executable"],
      ["bin/sherpa-onnx-vad.exe", "vad", "vad-executable"],
      ["bin/onnxruntime.dll", "dll", "dll"],
      ["model/model.int8.onnx", "model", "model"],
      ["model/tokens.txt", "tokens", "tokens"],
      ["model/silero_vad.onnx", "silero", "vad-model"],
    ] as const;
    for (const [path, content] of files) await writeFile(join(root, path), content);
    const entries = files.map(([path, content, role]) => ({ path, role, sizeBytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") }));
    const manifest = { schemaVersion: 1, runtime: { version: "1.13.8", sourceUrl: "https://github.com/k2-fsa/sherpa-onnx/releases", files: entries.slice(0, 3) }, model: { id: "sherpa-onnx-paraformer-zh-2023-09-14", sourceUrl: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/model.tar.bz2", license: "Apache-2.0", files: entries.slice(3) } };
    await expect(verifyResourceTree(root, manifest)).resolves.toBeUndefined();
    await writeFile(join(root, "model/model.int8.onnx"), "xxxxx");
    await expect(verifyResourceTree(root, manifest)).rejects.toThrow(/CHECKSUM_MISMATCH/);
  });

  it("contains no unfinished checksum markers", async () => {
    const manifest = await readFile(new URL("../resources/paraformer-manifest.json", import.meta.url), "utf8");
    expect(manifest).not.toMatch(/replace-with|TBD|TODO/i);
    for (const digest of [...manifest.matchAll(/"sha256"\s*:\s*"([^"]+)"/g)].map((match) => match[1])) expect(digest).toMatch(/^[a-f\d]{64}$/);
  });
});
