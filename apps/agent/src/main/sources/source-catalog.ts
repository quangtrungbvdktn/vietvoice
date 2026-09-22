import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface SourceRecord { sourceId: string; path: string }
interface PersistedCatalog { sources: SourceRecord[] }

export class SourceCatalogError extends Error {
  constructor(
    message: string,
    readonly code: "SOURCE_INVALID" | "SOURCE_NOT_REGISTERED",
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SourceCatalogError";
  }
}

export class JsonSourceCatalog {
  private readonly catalogPath: string;
  private operations: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.catalogPath = join(directory, "sources.json");
  }

  register(source: SourceRecord): Promise<void> {
    if (!source.sourceId.startsWith("local:") || !source.path.trim()) {
      return Promise.reject(new SourceCatalogError("Nguồn cục bộ không hợp lệ.", "SOURCE_INVALID", false));
    }
    return this.enqueue(async () => {
      const catalog = await this.readDirect();
      catalog.sources = catalog.sources.filter((item) => item.sourceId !== source.sourceId);
      catalog.sources.push(source);
      await this.write(catalog);
    });
  }

  async resolve(sourceId: string): Promise<string> {
    await this.operations;
    const source = (await this.readDirect()).sources.find((item) => item.sourceId === sourceId);
    if (!source) {
      throw new SourceCatalogError(`Không tìm thấy tệp gốc cho ${sourceId}. Hãy quét hoặc chọn lại video.`, "SOURCE_NOT_REGISTERED", false);
    }
    return source.path;
  }

  async resolveMany(sourceIds: string[]): Promise<string[]> {
    return Promise.all(sourceIds.map((sourceId) => this.resolve(sourceId)));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readDirect(): Promise<PersistedCatalog> {
    try {
      const parsed = JSON.parse(await readFile(this.catalogPath, "utf8")) as Partial<PersistedCatalog>;
      return { sources: parsed.sources ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { sources: [] };
      throw error;
    }
  }

  private async write(catalog: PersistedCatalog): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = `${this.catalogPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(catalog), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.catalogPath);
  }
}
