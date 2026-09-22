import type { AgentMessage } from "@vietvoice/agent-protocol";

export function createHello(deviceId: string, lastAcknowledgedSequence: number): AgentMessage {
  return { type: "agent.hello", deviceId, protocolVersion: 1, lastAcknowledgedSequence };
}
