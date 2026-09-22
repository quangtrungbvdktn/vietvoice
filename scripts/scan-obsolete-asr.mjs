import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["apps", "packages", "docs/operations"];
const files = [".env.example"];
const forbidden = ["alibaba", "aliyun", "dashscope", "funasr", "groq_api_key", "groq-whisper"];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !["node_modules", "dist", ".next"].includes(entry.name))
    .map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : entry.isFile() ? [join(directory, entry.name)] : []));
  return nested.flat();
}
for (const root of roots) files.push(...await walk(root));
for (const path of files.filter((path) => path === ".env.example" || ["", ".ts", ".tsx", ".js", ".mjs", ".md", ".json"].includes(extname(path)))) {
  const content = (await readFile(path, "utf8")).toLowerCase();
  for (const token of forbidden) if (content.includes(token)) throw new Error(`Obsolete ASR identifier ${token} remains in ${path}`);
}
console.log(`Obsolete ASR scan passed (${files.length} files checked).`);
