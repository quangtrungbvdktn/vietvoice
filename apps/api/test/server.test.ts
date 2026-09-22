import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateApi } from "../src/server.js";

describe("private API bootstrap", () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => Promise.all(closers.splice(0).map((close) => close())));

  it("accepts only the configured server-side access token", async () => {
    const api = createPrivateApi({ VIETVOICE_PRIVATE_ACCESS_TOKEN: "private-secret", VIETVOICE_PRIVATE_USER_ID: "owner-1" });
    closers.push(() => api.close());
    expect((await api.inject({ method: "GET", url: "/v1/projects", headers: { authorization: "Bearer wrong" } })).statusCode).toBe(401);
    expect((await api.inject({ method: "GET", url: "/v1/projects", headers: { authorization: "Bearer private-secret" } })).statusCode).toBe(200);
  });

  it("refuses to boot without private credentials", () => {
    expect(() => createPrivateApi({})).toThrow(/VIETVOICE_PRIVATE_ACCESS_TOKEN/);
  });

  it("allows the configured Web Dashboard origin to call the API", async () => {
    const api = createPrivateApi({ VIETVOICE_PRIVATE_ACCESS_TOKEN: "secret", VIETVOICE_PRIVATE_USER_ID: "owner", WEB_ORIGIN: "http://127.0.0.1:3100" });
    closers.push(() => api.close());
    const response = await api.inject({ method: "OPTIONS", url: "/v1/projects", headers: { origin: "http://127.0.0.1:3100", "access-control-request-method": "GET" } });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3100");
  });

  it("restores projects after the private API restarts", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "vietvoice-api-"));
    const environment = { VIETVOICE_PRIVATE_ACCESS_TOKEN: "secret", VIETVOICE_PRIVATE_USER_ID: "owner", VIETVOICE_DATA_DIR: dataDirectory };
    const first = createPrivateApi(environment);
    const created = await first.inject({ method: "POST", url: "/v1/projects", headers: { authorization: "Bearer secret" }, payload: { name: "Dự án bền vững" } });
    expect(created.statusCode).toBe(201);
    await first.close();
    const restarted = createPrivateApi(environment);
    closers.push(() => restarted.close());
    const projects = await restarted.inject({ method: "GET", url: "/v1/projects", headers: { authorization: "Bearer secret" } });
    expect(projects.json()).toEqual([expect.objectContaining({ name: "Dự án bền vững" })]);
  });

  it("restores queued jobs after the private API restarts", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "vietvoice-api-"));
    const environment = { VIETVOICE_PRIVATE_ACCESS_TOKEN: "secret", VIETVOICE_PRIVATE_USER_ID: "owner", VIETVOICE_DATA_DIR: dataDirectory };
    const first = createPrivateApi(environment);
    const project = await first.inject({ method: "POST", url: "/v1/projects", headers: { authorization: "Bearer secret" }, payload: { name: "Job bền vững" } });
    const job = await first.inject({ method: "POST", url: `/v1/projects/${project.json().id}/jobs`, headers: { authorization: "Bearer secret" }, payload: { sourceIds: ["local:1"], mode: "translate_dub", concurrency: 1 } });
    expect(job.statusCode).toBe(202);
    const pairingCode = await first.inject({ method: "POST", url: "/v1/agents/pairing-code", headers: { authorization: "Bearer secret" } });
    const paired = await first.inject({ method: "POST", url: "/v1/agents/redeem", payload: { code: pairingCode.json().code, deviceId: "11111111-1111-4111-8111-111111111111", name: "Agent bền vững" } });
    await first.close();
    const restarted = createPrivateApi(environment);
    closers.push(() => restarted.close());
    const jobs = await restarted.inject({ method: "GET", url: `/v1/projects/${project.json().id}/jobs`, headers: { authorization: "Bearer secret" } });
    expect(jobs.json()).toEqual([expect.objectContaining({ id: job.json().id, status: "queued", sourceIds: ["local:1"] })]);
    const claimed = await restarted.inject({ method: "POST", url: "/v1/agent/jobs/claim", headers: { authorization: `Bearer ${paired.json().deviceToken}` } });
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json()).toMatchObject({ id: job.json().id });
  });
});
