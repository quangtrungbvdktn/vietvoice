import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryProjectRepository } from "@vietvoice/database";
import { createApi } from "../src/app.js";

const ownerA = randomUUID();
const ownerB = randomUUID();

describe("project routes", () => {
  const repository = new MemoryProjectRepository();
  let api: ReturnType<typeof createApi>;

  beforeEach(() => {
    repository.clear();
    api = createApi({
      projects: repository,
      verifyToken: async (token) => {
        if (!token.startsWith("test:")) return null;
        return { userId: token.slice(5) };
      },
    });
  });
  afterEach(async () => api.close());

  it("never returns another user's project", async () => {
    const created = await repository.create(ownerA, { name: "Phim của A" });
    const response = await api.inject({
      method: "GET",
      url: `/v1/projects/${created.id}`,
      headers: { authorization: `Bearer test:${ownerB}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "PROJECT_NOT_FOUND" });
  });

  it("creates, renames, duplicates and deletes only owned projects", async () => {
    const auth = { authorization: `Bearer test:${ownerA}` };
    const createdResponse = await api.inject({
      method: "POST",
      url: "/v1/projects",
      headers: auth,
      payload: { name: "Huyền môn" },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json();

    const renamedResponse = await api.inject({
      method: "PATCH",
      url: `/v1/projects/${created.id}`,
      headers: auth,
      payload: { name: "Huyền môn — bản Việt", version: created.version },
    });
    expect(renamedResponse.json().name).toBe("Huyền môn — bản Việt");

    const duplicateResponse = await api.inject({
      method: "POST",
      url: `/v1/projects/${created.id}/duplicate`,
      headers: auth,
    });
    expect(duplicateResponse.statusCode).toBe(201);
    expect(duplicateResponse.json().name).toBe("Huyền môn — bản Việt (bản sao)");

    const deleteResponse = await api.inject({
      method: "DELETE",
      url: `/v1/projects/${created.id}`,
      headers: auth,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await api.inject({
      method: "GET",
      url: "/v1/projects",
      headers: auth,
    });
    expect(listResponse.json()).toHaveLength(1);
  });

  it("requires authentication", async () => {
    const response = await api.inject({ method: "GET", url: "/v1/projects" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "UNAUTHORIZED" });
  });
});
