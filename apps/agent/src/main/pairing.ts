import type { AgentStateStore, SecretStorage } from "./store.js";

export async function persistPairing(
  deviceToken: string,
  dependencies: { secretStorage: SecretStorage; store: AgentStateStore },
): Promise<void> {
  await dependencies.store.saveDeviceToken(dependencies.secretStorage.encryptString(deviceToken));
}
