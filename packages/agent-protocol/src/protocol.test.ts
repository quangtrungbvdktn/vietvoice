import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AgentMessageSchema, PairingError, PairingManager } from "./index.js";

describe("Agent protocol", () => {
  it("rejects a pairing code after first use", async () => {
    const pairing = new PairingManager({ now: () => new Date("2026-09-19T10:00:00Z") });
    const userId = randomUUID();
    const deviceId = randomUUID();
    const code = await pairing.issue(userId);

    expect((await pairing.redeem(code, { deviceId, name: "Máy dựng phim" })).deviceToken).toBeTruthy();
    await expect(pairing.redeem(code, { deviceId, name: "Máy dựng phim" })).rejects.toEqual(
      new PairingError("PAIRING_CODE_USED"),
    );
  });

  it("rejects expired pairing codes", async () => {
    let now = new Date("2026-09-19T10:00:00Z");
    const pairing = new PairingManager({ now: () => now, lifetimeMs: 60_000 });
    const code = await pairing.issue(randomUUID());
    now = new Date("2026-09-19T10:01:01Z");

    await expect(pairing.redeem(code, { deviceId: randomUUID(), name: "PC" })).rejects.toEqual(
      new PairingError("PAIRING_CODE_EXPIRED"),
    );
  });

  it("validates progress and completion messages", () => {
    expect(
      AgentMessageSchema.parse({
        type: "stage.progress",
        leaseId: randomUUID(),
        sequence: 4,
        percent: 55,
      }).type,
    ).toBe("stage.progress");
    expect(() =>
      AgentMessageSchema.parse({
        type: "stage.progress",
        leaseId: randomUUID(),
        sequence: 4,
        percent: 101,
      }),
    ).toThrow();
  });

  it("restores paired devices without storing their raw token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-pairing-"));
    const path = join(directory, "pairing.json");
    const first = new PairingManager({ persistencePath: path });
    const code = await first.issue("owner-1");
    const paired = await first.redeem(code, { deviceId: randomUUID(), name: "Windows Agent" });
    expect(await readFile(path, "utf8")).not.toContain(paired.deviceToken);
    const restarted = new PairingManager({ persistencePath: path });
    await expect(restarted.authenticateDevice(paired.deviceToken)).resolves.toMatchObject({ ownerId: "owner-1", deviceName: "Windows Agent" });
  });
});
