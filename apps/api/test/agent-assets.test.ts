import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PairingManager } from "@vietvoice/agent-protocol";
import { MemoryProjectRepository } from "@vietvoice/database";
import { createApi } from "../src/app.js";
import { FileAgentAssetStore } from "../src/ai/agent-asset-store.js";

describe("temporary Agent audio assets", () => {
  const apis: Array<ReturnType<typeof createApi>> = [];
  afterEach(async () => Promise.all(apis.splice(0).map((api) => api.close())));

  it("publishes paired-Agent audio under an unguessable temporary URL", async () => {
    const owner = randomUUID();
    const pairing = new PairingManager();
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-assets-"));
    const api = createApi({
      projects: new MemoryProjectRepository(), pairing,
      assetStore: new FileAgentAssetStore(directory, "https://api.example", 60_000),
      verifyToken: async () => ({ userId: owner }),
    });
    apis.push(api);
    const paired = await pairing.redeem(await pairing.issue(owner), { deviceId: randomUUID(), name: "Windows Agent" });
    const uploaded = await api.inject({
      method: "POST", url: "/v1/agent/assets",
      headers: { authorization: `Bearer ${paired.deviceToken}`, "content-type": "application/octet-stream", "x-vietvoice-extension": "flac" },
      payload: Buffer.from("speech-audio"),
    });

    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().audioUrl).toMatch(/^https:\/\/api\.example\/v1\/agent\/assets\/[a-f\d-]+\.flac$/);
    const token = uploaded.json().audioUrl.split("/").at(-1);
    const downloaded = await api.inject({ method: "GET", url: `/v1/agent/assets/${token}` });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.rawPayload.toString()).toBe("speech-audio");
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");
  });

  it("does not expose an unknown asset token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-assets-"));
    const api = createApi({ projects: new MemoryProjectRepository(), assetStore: new FileAgentAssetStore(directory, "https://api.example", 60_000), verifyToken: async () => null });
    apis.push(api);
    expect((await api.inject({ method: "GET", url: "/v1/agent/assets/not-a-token.wav" })).statusCode).toBe(404);
  });
});
