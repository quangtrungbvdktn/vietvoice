import type { ServerMessage } from "@vietvoice/agent-protocol";

interface DeviceRecord {
  deviceId: string;
  ownerId: string;
  tokenHash: string;
  revoked: boolean;
  nextSequence: number;
  messages: Array<ServerMessage & { sequence: number }>;
}

export class AgentSessionRegistry {
  readonly #devices = new Map<string, DeviceRecord>();

  register(input: { deviceId: string; ownerId: string; tokenHash: string }): void {
    this.#devices.set(input.deviceId, { ...input, revoked: false, nextSequence: 1, messages: [] });
  }

  revoke(deviceId: string): void {
    const device = this.#devices.get(deviceId);
    if (device) device.revoked = true;
  }

  enqueue(deviceId: string, message: ServerMessage): number {
    const device = this.#devices.get(deviceId);
    if (!device) throw new Error("AGENT_NOT_FOUND");
    const sequence = device.nextSequence++;
    device.messages.push({ ...message, sequence });
    return sequence;
  }

  connect(input: { deviceId: string; tokenHash: string; lastAcknowledgedSequence: number }) {
    const device = this.#devices.get(input.deviceId);
    if (!device || device.tokenHash !== input.tokenHash) throw new Error("AGENT_UNAUTHORIZED");
    if (device.revoked) throw new Error("AGENT_REVOKED");
    return { ownerId: device.ownerId, pendingMessages: device.messages.filter((message) => message.sequence > input.lastAcknowledgedSequence) };
  }
}
