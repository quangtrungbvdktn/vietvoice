import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AgentSessionRegistry } from "../src/ws/agent-session.js";

describe("Agent sessions", () => {
  it("rejects a revoked device", () => {
    const registry = new AgentSessionRegistry();
    const deviceId = randomUUID();
    registry.register({ deviceId, ownerId: randomUUID(), tokenHash: "hash" });
    registry.revoke(deviceId);

    expect(() => registry.connect({ deviceId, tokenHash: "hash", lastAcknowledgedSequence: 0 })).toThrowError(
      "AGENT_REVOKED",
    );
  });

  it("replays only messages newer than the Agent acknowledgement", () => {
    const registry = new AgentSessionRegistry();
    const deviceId = randomUUID();
    registry.register({ deviceId, ownerId: randomUUID(), tokenHash: "hash" });
    registry.enqueue(deviceId, { type: "job.lease", jobId: randomUUID(), leaseId: randomUUID(), expiresAt: "2026-09-19T11:00:00.000Z" });
    registry.enqueue(deviceId, { type: "job.cancel", jobId: randomUUID() });

    const session = registry.connect({ deviceId, tokenHash: "hash", lastAcknowledgedSequence: 1 });
    expect(session.pendingMessages).toHaveLength(1);
    expect(session.pendingMessages[0]?.sequence).toBe(2);
  });
});
