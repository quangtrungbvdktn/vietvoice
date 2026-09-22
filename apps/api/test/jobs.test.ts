import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryProjectRepository } from "@vietvoice/database";
import { PairingManager } from "@vietvoice/agent-protocol";
import { createApi } from "../src/app.js";

describe("owned background jobs", () => {
  const owner = randomUUID();
  const stranger = randomUUID();
  let api: ReturnType<typeof createApi>;
  let projectId: string;

  beforeEach(async () => {
    const projects = new MemoryProjectRepository();
    projectId = (await projects.create(owner, { name: "Jobs" })).id;
    api = createApi({ projects, verifyToken: async (token) => ({ userId: token }) });
  });
  afterEach(async () => api.close());

  it("queues a resumable pipeline job for selected source ids", async () => {
    const response = await api.inject({ method: "POST", url: `/v1/projects/${projectId}/jobs`, headers: { authorization: `Bearer ${owner}` }, payload: { sourceIds: ["yt:01"], mode: "translate_dub", concurrency: 2 } });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: "queued", stage: "video_input", sourceIds: ["yt:01"], mode: "translate_dub", concurrency: 2 });
    const listed = await api.inject({ method: "GET", url: `/v1/projects/${projectId}/jobs`, headers: { authorization: `Bearer ${owner}` } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([expect.objectContaining({ id: response.json().id, status: "queued", sourceIds: ["yt:01"] })]);
  });

  it("does not expose another owner's jobs", async () => {
    const created = await api.inject({ method: "POST", url: `/v1/projects/${projectId}/jobs`, headers: { authorization: `Bearer ${owner}` }, payload: { sourceIds: ["yt:01"], mode: "translate_subtitle", concurrency: 1 } });
    const response = await api.inject({ method: "PATCH", url: `/jobs/${created.json().id}`, headers: { authorization: `Bearer ${stranger}` }, payload: { action: "cancel" } });
    expect(response.statusCode).toBe(404);
  });

  it("lets only the paired owner Agent claim and complete a queued job", async () => {
    const pairing = new PairingManager();
    const projects = new MemoryProjectRepository();
    const ownedProject = await projects.create(owner, { name: "Agent dispatch" });
    const dispatchApi = createApi({ projects, pairing, verifyToken: async (token) => ({ userId: token }) });
    const code = await pairing.issue(owner);
    const paired = await pairing.redeem(code, { deviceId: randomUUID(), name: "PC dựng phim" });
    const created = await dispatchApi.inject({ method: "POST", url: `/v1/projects/${ownedProject.id}/jobs`, headers: { authorization: `Bearer ${owner}` }, payload: { sourceIds: ["local:episode-1"], mode: "translate_dub", concurrency: 1 } });

    const claimed = await dispatchApi.inject({ method: "POST", url: "/v1/agent/jobs/claim", headers: { authorization: `Bearer ${paired.deviceToken}` } });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json()).toMatchObject({ id: created.json().id, leaseId: expect.any(String), sourceIds: ["local:episode-1"] });
    expect((await dispatchApi.inject({ method: "POST", url: "/v1/agent/jobs/claim", headers: { authorization: `Bearer ${paired.deviceToken}` } })).statusCode).toBe(204);

    const completed = await dispatchApi.inject({ method: "POST", url: `/v1/agent/jobs/${created.json().id}/complete`, headers: { authorization: `Bearer ${paired.deviceToken}` }, payload: { leaseId: claimed.json().leaseId, artifact: { path: "D:\\Exports\\episode-1.mp4", sha256: "a".repeat(64) } } });
    expect(completed.statusCode).toBe(200);
    expect(completed.json()).toMatchObject({ status: "completed", progress: 100 });
    await dispatchApi.close();
  });

  it("records a paired Agent failure so the user can retry the job", async () => {
    const pairing = new PairingManager();
    const projects = new MemoryProjectRepository();
    const ownedProject = await projects.create(owner, { name: "Agent failure" });
    const dispatchApi = createApi({ projects, pairing, verifyToken: async (token) => ({ userId: token }) });
    const paired = await pairing.redeem(await pairing.issue(owner), { deviceId: randomUUID(), name: "PC dựng phim" });
    const created = await dispatchApi.inject({ method: "POST", url: `/v1/projects/${ownedProject.id}/jobs`, headers: { authorization: `Bearer ${owner}` }, payload: { sourceIds: ["local:episode-2"], mode: "translate_dub", concurrency: 1 } });
    const claimed = await dispatchApi.inject({ method: "POST", url: "/v1/agent/jobs/claim", headers: { authorization: `Bearer ${paired.deviceToken}` } });

    const failed = await dispatchApi.inject({
      method: "POST", url: `/v1/agent/jobs/${created.json().id}/fail`,
      headers: { authorization: `Bearer ${paired.deviceToken}` },
      payload: { leaseId: claimed.json().leaseId, code: "EDGE_TTS_FAILED", message: "Không thể tạo giọng đọc. Hãy thử lại." },
    });

    expect(failed.statusCode).toBe(200);
    expect(failed.json()).toMatchObject({ status: "failed", errorCode: "EDGE_TTS_FAILED", error: "Không thể tạo giọng đọc. Hãy thử lại." });
    await dispatchApi.close();
  });
});
