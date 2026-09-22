import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LocalStageName, StageCache } from "./local-job-executor.js";

interface CacheEntry { jobId: string; sourceId: string; stage: LocalStageName; identity?: string; value: unknown }
interface PersistedCache { entries: CacheEntry[] }

export class JsonStageCache implements StageCache {
  private readonly path: string;
  private operations: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.path = join(directory, "stage-cache.json");
  }

  async get(jobId: string, sourceId: string, stage: LocalStageName, identity?: string): Promise<unknown | null> {
    await this.operations;
    return (await this.readDirect()).entries.find((entry) => matches(entry, jobId, sourceId, stage, identity))?.value ?? null;
  }

  put(jobId: string, sourceId: string, stage: LocalStageName, value: unknown, identity?: string): Promise<void> {
    return this.enqueue(async () => {
      const cache = await this.readDirect();
      cache.entries = cache.entries.filter((entry) => !matches(entry, jobId, sourceId, stage, identity));
      cache.entries.push({ jobId, sourceId, stage, ...(identity ? { identity } : {}), value });
      await this.write(cache);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readDirect(): Promise<PersistedCache> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<PersistedCache>;
      return { entries: parsed.entries ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [] };
      throw error;
    }
  }

  private async write(cache: PersistedCache): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(cache), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.path);
  }
}

function matches(entry: CacheEntry, jobId: string, sourceId: string, stage: LocalStageName, identity?: string): boolean {
  return entry.jobId === jobId && entry.sourceId === sourceId && entry.stage === stage && entry.identity === identity;
}
