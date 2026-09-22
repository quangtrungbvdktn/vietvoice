import { createWriteStream } from "node:fs";
import { cp, mkdtemp, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sha256File, verifyResourceTree } from "./verify-paraformer.mjs";

const runtime = { name: "sherpa-onnx-v1.13.8-win-x64-shared-MT-Release-no-tts.tar.bz2", sha256: "4b0a94f7b5c606b1b64a19a831c2127559e4b3d34e195465ebc7be73d9ed4783", url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-win-x64-shared-MT-Release-no-tts.tar.bz2" };
const model = { name: "sherpa-onnx-paraformer-zh-2023-09-14.tar.bz2", sha256: "9c49fd9c6fb63de8e18c1054cf3d100f804741b7e608e187923cd8ff09fa9f03", url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-paraformer-zh-2023-09-14.tar.bz2" };
const vad = { name: "silero_vad.onnx", sha256: "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6", url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" };
const runtimeRoot = "sherpa-onnx-v1.13.8-win-x64-shared-MT-Release-no-tts";
const modelRoot = "sherpa-onnx-paraformer-zh-2023-09-14";

async function main() {
  const work = await mkdtemp(join(tmpdir(), "vietvoice-paraformer-"));
  const output = fileURLToPath(new URL("../resources/paraformer", import.meta.url));
  const staging = `${output}.staging`;
  try {
    const sources = await Promise.all([
      acquire(runtime, process.env.VIETVOICE_SHERPA_ARCHIVE, work),
      acquire(model, process.env.VIETVOICE_PARAFORMER_ARCHIVE, work),
      acquire(vad, process.env.VIETVOICE_SILERO_MODEL, work),
    ]);
    await runTar(sources[0], work); await runTar(sources[1], work);
    await rm(staging, { recursive: true, force: true });
    const selected = [
      [`${runtimeRoot}/bin/sherpa-onnx-offline.exe`, "bin/sherpa-onnx-offline.exe", "executable"],
      [`${runtimeRoot}/bin/sherpa-onnx-vad.exe`, "bin/sherpa-onnx-vad.exe", "vad-executable"],
      [`${runtimeRoot}/bin/onnxruntime.dll`, "bin/onnxruntime.dll", "dll"],
      [`${runtimeRoot}/bin/onnxruntime_providers_shared.dll`, "bin/onnxruntime_providers_shared.dll", "dll"],
      [`${modelRoot}/model.int8.onnx`, "model/model.int8.onnx", "model"],
      [`${modelRoot}/tokens.txt`, "model/tokens.txt", "tokens"],
    ];
    const entries = [];
    for (const [source, target, role] of selected) {
      await mkdir(dirname(join(staging, target)), { recursive: true });
      await cp(join(work, source), join(staging, target));
      entries.push(await entry(join(staging, target), target, role));
    }
    await mkdir(join(staging, "model"), { recursive: true });
    await cp(sources[2], join(staging, "model/silero_vad.onnx"));
    entries.push(await entry(join(staging, "model/silero_vad.onnx"), "model/silero_vad.onnx", "vad-model"));
    const manifest = { schemaVersion: 1, runtime: { version: "1.13.8", sourceUrl: runtime.url, archiveSha256: runtime.sha256, files: entries.filter((item) => ["executable", "vad-executable", "dll"].includes(item.role)) }, model: { id: modelRoot, sourceUrl: model.url, archiveSha256: model.sha256, license: "Apache-2.0", files: entries.filter((item) => ["model", "tokens", "vad-model"].includes(item.role)) } };
    await verifyResourceTree(staging, manifest);
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    await writeFile(new URL("../resources/paraformer-manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log("Paraformer resources prepared and verified.");
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(staging, { recursive: true, force: true });
  }
}
async function acquire(definition, localPath, work) {
  const target = join(work, definition.name);
  if (localPath) await cp(localPath, target); else await download(definition.url, target);
  if (await sha256File(target) !== definition.sha256) throw new Error(`ARCHIVE_CHECKSUM_MISMATCH:${definition.name}`);
  return target;
}
async function download(url, path) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`DOWNLOAD_FAILED:${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
}
async function runTar(archive, destination) {
  await new Promise((resolve, reject) => {
    const child = spawn("tar", ["--no-same-owner", "-xjf", archive, "-C", destination], { shell: false, stdio: "inherit" });
    child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`TAR_FAILED:${code}`)));
  });
}
async function entry(path, relativePath, role) { return { path: relativePath, role, sizeBytes: (await stat(path)).size, sha256: await sha256File(path) }; }
main().catch((error) => { console.error(error); process.exitCode = 1; });
