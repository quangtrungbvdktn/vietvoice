import { describe, expect, it, vi } from "vitest";
import { redeemPairingCode } from "../src/main/pairing-client.js";

describe("pairing client", () => {
  it("redeems a pairing code and persists only the device token", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deviceToken: "device-secret", ownerId: "owner-1" }), { status: 201 }));
    const result = await redeemPairingCode({ apiUrl: "http://127.0.0.1:3200", code: "12345678", deviceId: "device-1", name: "PC" }, { request, save });
    expect(save).toHaveBeenCalledWith("device-secret");
    expect(result).toEqual({ ownerId: "owner-1" });
  });
});
