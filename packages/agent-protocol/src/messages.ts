import { z } from "zod";

const SequenceSchema = z.number().int().positive();
const ArtifactRefSchema = z.object({ id: z.string().uuid(), kind: z.string().min(1), sha256: z.string().length(64) });
const PublicJobErrorSchema = z.object({ code: z.string().min(1), message: z.string().min(1), retryable: z.boolean() });

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("job.lease"), sequence: SequenceSchema.optional(), jobId: z.string().uuid(), leaseId: z.string().uuid(), expiresAt: z.string().datetime() }),
  z.object({ type: z.literal("job.cancel"), sequence: SequenceSchema.optional(), jobId: z.string().uuid() }),
]);

export const AgentMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent.hello"), deviceId: z.string().uuid(), protocolVersion: z.literal(1), lastAcknowledgedSequence: z.number().int().nonnegative() }),
  z.object({ type: z.literal("stage.progress"), leaseId: z.string().uuid(), sequence: SequenceSchema, percent: z.number().min(0).max(100), detail: z.string().max(500).optional() }),
  z.object({ type: z.literal("stage.completed"), leaseId: z.string().uuid(), sequence: SequenceSchema, artifact: ArtifactRefSchema }),
  z.object({ type: z.literal("stage.failed"), leaseId: z.string().uuid(), sequence: SequenceSchema, error: PublicJobErrorSchema }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
