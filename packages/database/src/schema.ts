import type { Project, ProjectId } from "@vietvoice/contracts";

export interface CreateProjectInput {
  name: string;
}

export interface ProjectSummary extends Project {
  thumbnailUrl: string | null;
  totalDurationMs: number;
  videoCount: number;
  progress: number;
}

export interface ProjectRepository {
  create(ownerId: string, input: CreateProjectInput): Promise<ProjectSummary>;
  list(ownerId: string): Promise<ProjectSummary[]>;
  get(ownerId: string, id: ProjectId): Promise<ProjectSummary | null>;
  duplicate(ownerId: string, id: ProjectId): Promise<ProjectSummary>;
  rename(ownerId: string, id: ProjectId, name: string, version: number): Promise<ProjectSummary>;
  delete(ownerId: string, id: ProjectId): Promise<void>;
}
