import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type PairingErrorCode = "PAIRING_CODE_INVALID" | "PAIRING_CODE_USED" | "PAIRING_CODE_EXPIRED";

export class PairingError extends Error {
  constructor(readonly code: PairingErrorCode) {
    super(code);
    this.name = "PairingError";
  }
}

interface PairingRecord {
  ownerId: string;
  expiresAt: number;
  used: boolean;
}

export class PairingManager {
  readonly #records = new Map<string, PairingRecord>();
  readonly #devices = new Map<string, { deviceId: string; deviceName: string; ownerId: string }>();
  readonly #now: () => Date;
  readonly #lifetimeMs: number;
  readonly #persistencePath: string | undefined;

  constructor(options: { now?: () => Date; lifetimeMs?: number; persistencePath?: string } = {}) {
    this.#now = options.now ?? (() => new Date());
    this.#lifetimeMs = options.lifetimeMs ?? 10 * 60_000;
    this.#persistencePath = options.persistencePath;
    this.restore();
  }

  async issue(ownerId: string): Promise<string> {
    let code: string;
    do code = randomBytes(4).readUInt32BE(0).toString().slice(0, 8).padStart(8, "0");
    while (this.#records.has(code));
    this.#records.set(code, { ownerId, expiresAt: this.#now().getTime() + this.#lifetimeMs, used: false });
    this.persist();
    return code;
  }

  async redeem(code: string, device: { deviceId: string; name: string }) {
    const record = this.#records.get(code);
    if (!record) throw new PairingError("PAIRING_CODE_INVALID");
    if (record.used) throw new PairingError("PAIRING_CODE_USED");
    if (record.expiresAt < this.#now().getTime()) throw new PairingError("PAIRING_CODE_EXPIRED");
    record.used = true;
    const deviceToken = `${randomUUID()}.${randomBytes(32).toString("base64url")}`;
    const paired = { deviceId: device.deviceId, deviceName: device.name, ownerId: record.ownerId };
    this.#devices.set(tokenHash(deviceToken), paired);
    this.persist();
    return { ...paired, deviceToken };
  }

  async authenticateDevice(deviceToken: string) { const device = this.#devices.get(tokenHash(deviceToken)); return device ? structuredClone(device) : null; }

  private restore(): void {
    if (!this.#persistencePath) return;
    try {
      const state = JSON.parse(readFileSync(this.#persistencePath, "utf8")) as { records?: Array<[string, PairingRecord]>; devices?: Array<[string, { deviceId: string; deviceName: string; ownerId: string }]> };
      for (const [code, record] of state.records ?? []) this.#records.set(code, record);
      for (const [hash, device] of state.devices ?? []) this.#devices.set(hash, device);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private persist(): void {
    if (!this.#persistencePath) return;
    mkdirSync(dirname(this.#persistencePath), { recursive: true });
    const temporary = `${this.#persistencePath}.tmp`;
    writeFileSync(temporary, JSON.stringify({ records: [...this.#records], devices: [...this.#devices] }), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.#persistencePath);
  }
}

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
