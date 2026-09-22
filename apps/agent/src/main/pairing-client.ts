export interface PairingInput { apiUrl: string; code: string; deviceId: string; name: string }

export async function redeemPairingCode(
  input: PairingInput,
  dependencies: { request: typeof fetch; save(token: string): Promise<void> } = { request: fetch, save: async () => {} },
): Promise<{ ownerId: string }> {
  const response = await dependencies.request(`${input.apiUrl.replace(/\/$/, "")}/v1/agents/redeem`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: input.code, deviceId: input.deviceId, name: input.name }),
  });
  if (!response.ok) throw new Error(`PAIRING_FAILED_${response.status}`);
  const result = await response.json() as { deviceToken?: string; ownerId?: string };
  if (!result.deviceToken || !result.ownerId) throw new Error("PAIRING_RESPONSE_INVALID");
  await dependencies.save(result.deviceToken);
  return { ownerId: result.ownerId };
}
