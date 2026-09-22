import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonProjectRepository } from "./json-project-repository.js";

describe("JsonProjectRepository", () => {
  it("persists owner-scoped projects and versions across server restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-projects-"));
    const path = join(directory, "projects.json");
    const first = new JsonProjectRepository(path);
    const created = await first.create("owner-a", { name: "Phim dài tập" });
    await first.rename("owner-a", created.id, "Phim đã dịch", created.version);

    const restarted = new JsonProjectRepository(path);
    await expect(restarted.get("owner-a", created.id)).resolves.toMatchObject({ name: "Phim đã dịch", version: 1 });
    await expect(restarted.get("owner-b", created.id)).resolves.toBeNull();
  });

  it("does not lose projects created concurrently", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-projects-"));
    const repository = new JsonProjectRepository(join(directory, "projects.json"));
    await Promise.all([repository.create("owner", { name: "A" }), repository.create("owner", { name: "B" })]);
    await expect(repository.list("owner")).resolves.toHaveLength(2);
  });
});
