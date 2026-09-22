import { createHash } from "node:crypto";
import type { Provider, ProviderPolicy, ProviderResult } from "./types.js";

export class ProviderRouter {
  private readonly cache = new Map<string, ProviderResult<unknown>>();

  constructor(private readonly providers: Map<string, Provider<unknown, unknown>>) {}

  async run<T, I>(input: I, primaryId: string, policy: ProviderPolicy): Promise<ProviderResult<T>> {
    const cacheKey = `${primaryId}:${this.requestHash(input)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached as ProviderResult<T>;
    let lastError: unknown;

    for (const providerId of [primaryId, ...policy.fallbackProviderIds]) {
      const provider = this.providers.get(providerId);
      if (!provider) continue;
      for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
        const controller = new AbortController();
        try {
          const result = await withTimeout(provider.run(input, controller.signal), policy.timeoutMs, controller);
          this.cache.set(cacheKey, result);
          return result as ProviderResult<T>;
        } catch (error) {
          lastError = error;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("AI_PROVIDER_UNAVAILABLE");
  }

  requestHash(input: unknown): string {
    return createHash("sha256").update(stableJson(input)).digest("hex");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort(new Error("PROVIDER_TIMEOUT"));
      reject(new Error("PROVIDER_TIMEOUT"));
    }, timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
