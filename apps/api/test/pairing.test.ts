import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryProjectRepository } from "@vietvoice/database";
import { createApi } from "../src/app.js";

describe("agent pairing routes", () => {
  const api = createApi({ projects: new MemoryProjectRepository(), verifyToken: async (token) => token === "owner-token" ? { userId: "owner-1" } : null });
  afterEach(async () => api.close());

  it("redeems a one-time pairing code without exposing the web access token", async () => {
    const issued = await api.inject({ method: "POST", url: "/v1/agents/pairing-code", headers: { authorization: "Bearer owner-token" } });
    const response = await api.inject({ method: "POST", url: "/v1/agents/redeem", payload: { code: issued.json().code, deviceId: randomUUID(), name: "Máy dựng phim" } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ ownerId: "owner-1", deviceName: "Máy dựng phim" });
    expect(response.json().deviceToken).toEqual(expect.any(String));
  });
});
