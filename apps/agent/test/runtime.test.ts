import { describe, expect, it, vi } from "vitest";
import { AgentRuntime } from "../src/main/runtime.js";

describe("Agent runtime", () => {
  it("claims one owned job, executes it locally, and reports the artifact", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-1", leaseId: "11111111-1111-4111-8111-111111111111", sourceIds: ["local:episode-1"], mode: "translate_dub", concurrency: 1 }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed" }), { status: 200 }));
    const execute = vi.fn().mockResolvedValue({ path: "D:\\Exports\\episode-1.mp4", sha256: "a".repeat(64) });
    const runtime = new AgentRuntime({ apiUrl: "http://127.0.0.1:3200", deviceToken: "device-token" }, { request, execute });

    await expect(runtime.runOnce()).resolves.toBe(true);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1", sourceIds: ["local:episode-1"] }));
    expect(request).toHaveBeenLastCalledWith("http://127.0.0.1:3200/v1/agent/jobs/job-1/complete", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer device-token" }),
    }));
  });

  it("idles without invoking an executor when no job is queued", async () => {
    const execute = vi.fn();
    const runtime = new AgentRuntime({ apiUrl: "http://127.0.0.1:3200", deviceToken: "device-token" }, { request: vi.fn().mockResolvedValue(new Response(null, { status: 204 })), execute });
    await expect(runtime.runOnce()).resolves.toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a safe public failure instead of leaving a claimed job running", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job-2", leaseId: "22222222-2222-4222-8222-222222222222", sourceIds: ["local:episode-2"], mode: "translate_dub", concurrency: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed" }), { status: 200 }));
    const secret = "server-api-key-must-not-leak";
    const execute = vi.fn().mockRejectedValue(Object.assign(new Error(`provider failed: ${secret}`), {
      code: "EDGE_TTS_FAILED",
      publicMessage: "Không thể tạo giọng đọc. Hãy thử lại.",
    }));
    const runtime = new AgentRuntime({ apiUrl: "http://127.0.0.1:3200", deviceToken: "device-token" }, { request, execute });

    await expect(runtime.runOnce()).resolves.toBe(true);
    const [, options] = request.mock.calls[1] as [string, RequestInit];
    expect(request.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3200/v1/agent/jobs/job-2/fail");
    expect(options.body).toBe(JSON.stringify({
      leaseId: "22222222-2222-4222-8222-222222222222",
      code: "EDGE_TTS_FAILED",
      message: "Không thể tạo giọng đọc. Hãy thử lại.",
    }));
    expect(String(options.body)).not.toContain(secret);
  });
});
