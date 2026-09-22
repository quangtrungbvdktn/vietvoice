import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

export async function verifyResourceTree(root, manifest) {
  if (manifest.schemaVersion !== 1) throw new Error("MANIFEST_SCHEMA_INVALID");
  const entries = [...manifest.runtime.files, ...manifest.model.files];
  const declared = new Set(entries.map((entry) => entry.path.replaceAll("\\", "/")));
  for (const entry of entries) {
    if (!/^[a-f\d]{64}$/i.test(entry.sha256)) throw new Error(`CHECKSUM_INVALID:${entry.path}`);
    const path = join(root, entry.path);
    if ((await stat(path)).size !== entry.sizeBytes) throw new Error(`SIZE_MISMATCH:${entry.path}`);
    if (await sha256File(path) !== entry.sha256) throw new Error(`CHECKSUM_MISMATCH:${entry.path}`);
  }
  for (const path of await executableFiles(root)) {
    const item = relative(root, path).replaceAll("\\", "/");
    if (!declared.has(item)) throw new Error(`UNDECLARED_EXECUTABLE:${item}`);
  }
}

async function executableFiles(root) {
  const result = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(?:exe|dll)$/i.test(entry.name)) result.push(path);
    }
  }
  await walk(root);
  return result;
}

async function main() {
  const root = process.argv[2] ?? fileURLToPath(new URL("../resources/paraformer/", import.meta.url));
  const manifestPath = process.argv[3] ?? fileURLToPath(new URL("../resources/paraformer-manifest.json", import.meta.url));
  await verifyResourceTree(root, JSON.parse(await readFile(manifestPath, "utf8")));
  console.log("Paraformer resource verification passed.");
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
