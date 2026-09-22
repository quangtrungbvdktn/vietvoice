import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonSourceCatalog, SourceCatalogError } from "../src/main/sources/source-catalog.js";

describe("local source catalog", () => {
  it("resolves registered local source IDs after an Agent restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-sources-"));
    const first = new JsonSourceCatalog(directory);
    await first.register({ sourceId: "local:episode-01", path: "D:\\Series\\Episode 01.mp4" });

    const restarted = new JsonSourceCatalog(directory);
    await expect(restarted.resolve("local:episode-01")).resolves.toBe("D:\\Series\\Episode 01.mp4");
  });

  it("updates an existing source without losing other registrations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-sources-"));
    const catalog = new JsonSourceCatalog(directory);
    await Promise.all([
      catalog.register({ sourceId: "local:a", path: "D:\\a.mp4" }),
      catalog.register({ sourceId: "local:b", path: "D:\\b.mp4" }),
    ]);
    await catalog.register({ sourceId: "local:a", path: "E:\\moved-a.mp4" });

    await expect(catalog.resolveMany(["local:a", "local:b"])).resolves.toEqual(["E:\\moved-a.mp4", "D:\\b.mp4"]);
  });

  it("reports an actionable non-retryable error for an unknown source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-sources-"));
    const catalog = new JsonSourceCatalog(directory);
    await expect(catalog.resolve("local:missing")).rejects.toMatchObject({ code: "SOURCE_NOT_REGISTERED", retryable: false } satisfies Partial<SourceCatalogError>);
  });
});
