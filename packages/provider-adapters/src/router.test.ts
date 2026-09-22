import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderRouter } from "./router.js";
import type { ProviderResult } from "./types.js";

describe("ProviderRouter", () => {
  afterEach(() => vi.useRealTimers());

  it("uses fallback only after primary retries are exhausted", async () => {
    const primary = { id: "gemini", run: vi.fn().mockRejectedValue(new Error("quota")) };
    const fallback = { id: "openrouter", run: vi.fn().mockResolvedValue({ providerId: "openrouter", model: "free", value: "ok" }) };
    const router = new ProviderRouter(new Map([[primary.id, primary], [fallback.id, fallback]]));

    await expect(router.run("x", primary.id, { timeoutMs: 45_000, retries: 2, fallbackProviderIds: [fallback.id] })).resolves.toMatchObject({ value: "ok" });
    expect(primary.run).toHaveBeenCalledTimes(3);
    expect(fallback.run).toHaveBeenCalledOnce();
  });

  it("aborts timed-out attempts before starting the fallback", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const primary = { id: "gemini", run: vi.fn((_input: unknown, signal: AbortSignal) => { signals.push(signal); return new Promise<ProviderResult<unknown>>(() => {}); }) };
    const fallback = { id: "openrouter", run: vi.fn().mockResolvedValue({ providerId: "openrouter", model: "free", value: "ok" }) };
    const router = new ProviderRouter(new Map([[primary.id, primary], [fallback.id, fallback]]));
    const result = router.run("x", primary.id, { timeoutMs: 45_000, retries: 1, fallbackProviderIds: [fallback.id] });

    await vi.advanceTimersByTimeAsync(90_000);
    await expect(result).resolves.toMatchObject({ value: "ok" });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });

  it("returns a cached successful artifact for the same normalized request", async () => {
    const provider = { id: "gemini", run: vi.fn().mockResolvedValue({ providerId: "gemini", model: "flash", value: "xin chào" }) };
    const router = new ProviderRouter(new Map([[provider.id, provider]]));
    const policy = { timeoutMs: 45_000, retries: 1 as const, fallbackProviderIds: [] };

    await router.run({ text: "hello", context: "greeting" }, provider.id, policy);
    await router.run({ context: "greeting", text: "hello" }, provider.id, policy);
    expect(provider.run).toHaveBeenCalledOnce();
  });
});
