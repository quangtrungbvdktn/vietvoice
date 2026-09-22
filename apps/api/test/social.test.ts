import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MemoryProjectRepository } from "@vietvoice/database";
import { createApi } from "../src/app.js";
import { PublishService } from "../src/social/manual-package.js";
import { EncryptedTokenStore } from "../src/social/token-store.js";
import { PublishError } from "../src/social/types.js";
import { OfficialSocialProvider } from "../src/social/official-provider.js";

describe("social publishing", () => {
  it("preserves the actual export and creates a manual package when permission is missing", async () => {
    const service = new PublishService({ publish: vi.fn().mockRejectedValue(new PublishError("PUBLISH_PERMISSION_REQUIRED")) });
    await expect(service.publish({ videoPath: "D:\\Exports\\episode.mp4", caption: "Nội dung", hashtags: ["#phim"], visibility: "private" })).resolves.toMatchObject({ status: "manual_ready", package: { files: ["D:\\Exports\\episode.mp4", "caption.txt"] } });
  });

  it("encrypts OAuth tokens at rest", () => {
    const store = new EncryptedTokenStore(randomBytes(32));
    store.save("connection-1", { accessToken: "tiktok-secret", refreshToken: "refresh-secret", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(store.serialized("connection-1")).not.toContain("tiktok-secret");
    expect(store.read("connection-1")).toMatchObject({ accessToken: "tiktok-secret" });
  });

  it("persists a future publish without calling the provider early", async () => {
    const provider = { publish: vi.fn() };
    const service = new PublishService(provider);
    const result = await service.publish({ videoPath: "video.mp4", caption: "Nội dung", hashtags: [], visibility: "public", scheduledAt: "2099-01-01T00:00:00.000Z" });
    expect(result).toMatchObject({ status: "queued" });
    expect(provider.publish).not.toHaveBeenCalled();
    expect(service.listScheduled()).toHaveLength(1);
  });

  it("never publishes another user's export", async () => {
    const ownerA = randomUUID(); const ownerB = randomUUID();
    const projects = new MemoryProjectRepository(); const project = await projects.create(ownerA, { name: "A" });
    const provider = { publish: vi.fn().mockResolvedValue({ platformPostId: "tiktok:1" }) };
    const api = createApi({ projects, verifyToken: async (token) => ({ userId: token }), socialProvider: provider });
    const exported = await api.inject({ method: "POST", url: `/v1/projects/${project.id}/exports`, headers: { authorization: `Bearer ${ownerA}` }, payload: { profile: { preset: "vertical", resolution: "1080p", quality: "high", frameMode: "crop" } } });
    const response = await api.inject({ method: "POST", url: "/v1/social/publish", headers: { authorization: `Bearer ${ownerB}` }, payload: { exportId: exported.json().id, caption: "Steal", hashtags: [], visibility: "public" } });
    expect(response.statusCode).toBe(404); expect(provider.publish).not.toHaveBeenCalled();
    await api.close();
  });

  it("does not mistake an upload-initialization response for a published post", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { publish_id: "pending" } }), { status: 200, headers: { "content-type": "application/json" } })));
    const provider = new OfficialSocialProvider("tiktok", "https://open.tiktokapis.com/init", "token");
    await expect(provider.publish({ videoPath: "video.mp4", caption: "test", hashtags: [], visibility: "private" })).rejects.toThrow("PUBLISH_FAILED");
    vi.unstubAllGlobals();
  });
});
