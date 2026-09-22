import { describe, expect, it, vi } from "vitest";
import { AgentPollingLoop } from "../src/main/polling-loop.js";

describe("Agent polling loop", () => {
  it("keeps polling after transient errors with bounded exponential backoff", async () => {
    const controller = new AbortController();
    const runOnce = vi.fn()
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"))
      .mockImplementationOnce(async () => { controller.abort(); return true; });
    const delays: number[] = [];
    const loop = new AgentPollingLoop({ runOnce }, {
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      onError: vi.fn(),
    });

    await loop.run(controller.signal);

    expect(runOnce).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it("waits between empty queue polls and stops cleanly when aborted", async () => {
    const controller = new AbortController();
    const runOnce = vi.fn().mockResolvedValue(false);
    const loop = new AgentPollingLoop({ runOnce }, {
      sleep: async (milliseconds) => { expect(milliseconds).toBe(2_000); controller.abort(); },
      onError: vi.fn(),
    });

    await expect(loop.run(controller.signal)).resolves.toBeUndefined();
    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});
