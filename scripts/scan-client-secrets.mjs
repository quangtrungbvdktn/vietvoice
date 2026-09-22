import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const clientRoot = "apps/web/.next/static";
const secretNames = ["PRIMARY_TRANSLATION_API_KEY", "OPENROUTER_API_KEY", "GEMINI_API_KEY", "VIETVOICE_PRIVATE_ACCESS_TOKEN"];
const secrets = secretNames.map((name) => [name, process.env[name]]).filter(([, value]) => value && value.length >= 8);
const forbiddenIdentifiers = [...secretNames, "SUPABASE_SERVICE_ROLE_KEY", "R2_SECRET_ACCESS_KEY", "TOKEN_ENCRYPTION_KEY"];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}

for (const path of (await files(clientRoot)).filter((item) => [".js", ".css", ".json"].includes(extname(item)))) {
  const content = await readFile(path, "utf8");
  for (const name of forbiddenIdentifiers) if (content.includes(name)) throw new Error(`${name} server-only identifier leaked into ${path}`);
  for (const [name, secret] of secrets) if (content.includes(secret)) throw new Error(`${name} leaked into ${path}`);
}
console.log(`Client bundle scan passed (${forbiddenIdentifiers.length} server-only identifiers and ${secrets.length} configured values checked).`);
