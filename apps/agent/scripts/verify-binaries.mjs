import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, process.argv[2] ?? "resources/binaries.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const binary of manifest.binaries) {
  const hash = createHash("sha256");
  await new Promise((done, reject) => createReadStream(resolve(root, binary.path)).on("data", (chunk) => hash.update(chunk)).on("end", done).on("error", reject));
  if (hash.digest("hex") !== binary.sha256.toLowerCase()) throw new Error(`Checksum mismatch: ${binary.path}`);
}
console.log(`Verified ${manifest.binaries.length} bundled binaries.`);
