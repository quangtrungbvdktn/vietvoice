import { createHash } from "node:crypto";
import type { StageName } from "@vietvoice/contracts";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function createCacheKey(stage: StageName, version: number, dependencies: unknown): string {
  return createHash("sha256").update(`${stage}:v${version}:${stable(dependencies)}`).digest("hex");
}
