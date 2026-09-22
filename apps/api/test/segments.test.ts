import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryProjectRepository } from "@vietvoice/database";
import { createApi } from "../src/app.js";

describe("versioned editor routes", () => {
  let api: ReturnType<typeof createApi>;
  const ownerId = randomUUID();
  let projectId: string;
  const auth = { authorization: `Bearer test:${ownerId}` };

  beforeEach(async () => {
    const projects = new MemoryProjectRepository();
    projectId = (await projects.create(ownerId, { name: "Editor test" })).id;
    api = createApi({ projects, verifyToken: async (token) => token.startsWith("test:") ? { userId: token.slice(5) } : null });
  });
  afterEach(async () => api.close());

  it("invalidates only render and export when subtitle style changes", async () => {
    const response = await api.inject({ method: "PATCH", url: `/v1/projects/${projectId}/editor`, headers: auth, payload: { expectedVersion: 0, subtitleStyle: { font: "Be Vietnam Pro", position: "bottom" } } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ version: 1, invalidatedStages: ["video_rendering", "export"] });
  });

  it("returns the current version instead of overwriting a concurrent edit", async () => {
    await api.inject({ method: "PATCH", url: `/v1/projects/${projectId}/editor`, headers: auth, payload: { expectedVersion: 0, translation: "Bản dịch A" } });
    const conflict = await api.inject({ method: "PATCH", url: `/v1/projects/${projectId}/editor`, headers: auth, payload: { expectedVersion: 0, translation: "Bản dịch B" } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "EDIT_CONFLICT", currentVersion: 1, changedFields: ["translation"] });
  });

  it("creates immutable export history entries for re-export", async () => {
    const payload = { profile: { preset: "vertical", resolution: "1080p", quality: "high", frameMode: "crop" } };
    const first = await api.inject({ method: "POST", url: `/v1/projects/${projectId}/exports`, headers: auth, payload });
    const second = await api.inject({ method: "POST", url: `/v1/projects/${projectId}/exports`, headers: auth, payload });
    expect(first.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.json().id);
    const history = await api.inject({ method: "GET", url: `/v1/projects/${projectId}/exports`, headers: auth });
    expect(history.json()).toHaveLength(2);
  });
});
