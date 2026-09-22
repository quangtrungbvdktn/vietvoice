import { safeStorage } from "electron";
import type { SecretStorage } from "./store.js";

export class ElectronSecretStorage implements SecretStorage {
  isAvailable(): boolean { return safeStorage.isEncryptionAvailable(); }
  encryptString(value: string): Buffer {
    if (!this.isAvailable()) throw new Error("SAFE_STORAGE_UNAVAILABLE");
    return safeStorage.encryptString(value);
  }
  decryptString(value: Buffer): string {
    if (!this.isAvailable()) throw new Error("SAFE_STORAGE_UNAVAILABLE");
    return safeStorage.decryptString(value);
  }
}
