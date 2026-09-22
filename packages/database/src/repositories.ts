import { randomUUID } from "node:crypto";

import { ProjectIdSchema, type ProjectId } from "@vietvoice/contracts";

import type {
  CreateProjectInput,
  ProjectRepository,
  ProjectSummary,
} from "./schema.js";

export class ProjectConflictError extends Error {
  readonly code = "PROJECT_VERSION_CONFLICT";
}

export class MemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<ProjectId, ProjectSummary>();

  clear(): void {
    this.#projects.clear();
  }

  async create(ownerId: string, input: CreateProjectInput): Promise<ProjectSummary> {
    const now = new Date().toISOString();
    const project: ProjectSummary = {
      id: ProjectIdSchema.parse(randomUUID()),
      ownerId,
      name: input.name.trim(),
      status: "draft",
      version: 0,
      createdAt: now,
      updatedAt: now,
      thumbnailUrl: null,
      totalDurationMs: 0,
      videoCount: 0,
      progress: 0,
    };
    this.#projects.set(project.id, project);
    return structuredClone(project);
  }

  async list(ownerId: string): Promise<ProjectSummary[]> {
    return [...this.#projects.values()]
      .filter((project) => project.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((project) => structuredClone(project));
  }

  async get(ownerId: string, id: ProjectId): Promise<ProjectSummary | null> {
    const project = this.#projects.get(id);
    return project?.ownerId === ownerId ? structuredClone(project) : null;
  }

  async duplicate(ownerId: string, id: ProjectId): Promise<ProjectSummary> {
    const source = await this.get(ownerId, id);
    if (!source) throw new Error("PROJECT_NOT_FOUND");
    const duplicate = await this.create(ownerId, { name: `${source.name} (bản sao)` });
    return {
      ...duplicate,
      thumbnailUrl: source.thumbnailUrl,
      totalDurationMs: source.totalDurationMs,
      videoCount: source.videoCount,
    };
  }

  async rename(ownerId: string, id: ProjectId, name: string, version: number): Promise<ProjectSummary> {
    const project = this.#projects.get(id);
    if (!project || project.ownerId !== ownerId) throw new Error("PROJECT_NOT_FOUND");
    if (project.version !== version) throw new ProjectConflictError();
    const updated: ProjectSummary = {
      ...project,
      name: name.trim(),
      version: project.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#projects.set(id, updated);
    return structuredClone(updated);
  }

  async delete(ownerId: string, id: ProjectId): Promise<void> {
    const project = this.#projects.get(id);
    if (!project || project.ownerId !== ownerId) throw new Error("PROJECT_NOT_FOUND");
    this.#projects.delete(id);
  }
}
