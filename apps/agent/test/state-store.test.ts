import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonAgentStateStore } from "../src/main/json-state-store.js";

describe("JSON agent state store", () => {
  it("persists the encrypted token and resumable checkpoints across restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-state-"));
    const first = new JsonAgentStateStore(directory);
    const checkpoint = { jobId: "job-1", leaseId: "lease-1", stage: "render", lastAcknowledgedSequence: 12 };
    await first.saveDeviceToken(Buffer.from("encrypted-token"));
    await first.saveConnection({ apiUrl: "https://api.example", deviceId: "device-1" });
    await first.saveCheckpoint(checkpoint);

    const restarted = new JsonAgentStateStore(directory);
    await expect(restarted.loadDeviceToken()).resolves.toEqual(Buffer.from("encrypted-token"));
    await expect(restarted.loadConnection()).resolves.toEqual({ apiUrl: "https://api.example", deviceId: "device-1" });
    await expect(restarted.listCheckpoints()).resolves.toEqual([checkpoint]);
  });

  it("serializes concurrent checkpoint updates without losing either job", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-state-"));
    const store = new JsonAgentStateStore(directory);
    await Promise.all([
      store.saveCheckpoint({ jobId: "job-a", leaseId: "lease-a", stage: "translation", lastAcknowledgedSequence: 1 }),
      store.saveCheckpoint({ jobId: "job-b", leaseId: "lease-b", stage: "render", lastAcknowledgedSequence: 2 }),
    ]);
    await expect(store.listCheckpoints()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ jobId: "job-a" }), expect.objectContaining({ jobId: "job-b" }),
    ]));
  });
});
