import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ProjectIdSchema, type ProjectId } from "@vietvoice/contracts";
import { ProjectConflictError } from "./repositories.js";
import type { CreateProjectInput, ProjectRepository, ProjectSummary } from "./schema.js";

export class JsonProjectRepository implements ProjectRepository {
  private operations: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}

  create(ownerId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    return this.mutate((projects) => {
      const now = new Date().toISOString();
      const project: ProjectSummary = { id: ProjectIdSchema.parse(randomUUID()), ownerId, name: input.name.trim(), status: "draft", version: 0, createdAt: now, updatedAt: now, thumbnailUrl: null, totalDurationMs: 0, videoCount: 0, progress: 0 };
      projects.push(project);
      return structuredClone(project);
    });
  }

  async list(ownerId: string): Promise<ProjectSummary[]> {
    await this.operations;
    return (await this.read()).filter((project) => project.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((project) => structuredClone(project));
  }

  async get(ownerId: string, id: ProjectId): Promise<ProjectSummary | null> {
    await this.operations;
    const project = (await this.read()).find((item) => item.id === id && item.ownerId === ownerId);
    return project ? structuredClone(project) : null;
  }

  duplicate(ownerId: string, id: ProjectId): Promise<ProjectSummary> {
    return this.mutate((projects) => {
      const source = projects.find((item) => item.id === id && item.ownerId === ownerId);
      if (!source) throw new Error("PROJECT_NOT_FOUND");
      const now = new Date().toISOString();
      const duplicate: ProjectSummary = { ...structuredClone(source), id: ProjectIdSchema.parse(randomUUID()), name: `${source.name} (bản sao)`, status: "draft", version: 0, createdAt: now, updatedAt: now, progress: 0 };
      projects.push(duplicate);
      return structuredClone(duplicate);
    });
  }

  rename(ownerId: string, id: ProjectId, name: string, version: number): Promise<ProjectSummary> {
    return this.mutate((projects) => {
      const index = projects.findIndex((item) => item.id === id && item.ownerId === ownerId);
      if (index < 0) throw new Error("PROJECT_NOT_FOUND");
      const project = projects[index]!;
      if (project.version !== version) throw new ProjectConflictError();
      const updated = { ...project, name: name.trim(), version: version + 1, updatedAt: new Date().toISOString() };
      projects[index] = updated;
      return structuredClone(updated);
    });
  }

  async delete(ownerId: string, id: ProjectId): Promise<void> {
    await this.mutate((projects) => {
      const index = projects.findIndex((item) => item.id === id && item.ownerId === ownerId);
      if (index < 0) throw new Error("PROJECT_NOT_FOUND");
      projects.splice(index, 1);
    });
  }

  private mutate<T>(change: (projects: ProjectSummary[]) => T | Promise<T>): Promise<T> {
    const operation = this.operations.then(async () => {
      const projects = await this.read();
      const result = await change(projects);
      await this.write(projects);
      return result;
    });
    this.operations = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async read(): Promise<ProjectSummary[]> {
    try { return JSON.parse(await readFile(this.path, "utf8")) as ProjectSummary[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }

  private async write(projects: ProjectSummary[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(projects), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
  }
}
