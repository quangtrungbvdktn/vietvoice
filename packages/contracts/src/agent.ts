import { z } from "zod";

export const AgentMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent.hello"),
    deviceId: z.string().uuid(),
    protocolVersion: z.literal(1),
  }),
  z.object({
    type: z.literal("stage.progress"),
    leaseId: z.string().uuid(),
    percent: z.number().min(0).max(100),
    detail: z.string().max(500).optional(),
  }),
]);

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
