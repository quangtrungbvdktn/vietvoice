import type { PairingManager } from "@vietvoice/agent-protocol";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const segmentSchema = z.object({ startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), text: z.string().min(1) });
export interface AgentAiService {
  recognize(input: { audioUrl: string; language: "auto" | "zh" | "en"; provider: "gemini-audio" | "openrouter-stt" }): Promise<{ text: string; segments: Array<{ startMs: number; endMs: number; text: string }> }>;
  translateSegments(segments: Array<{ startMs: number; endMs: number; text: string }>): Promise<string[]>;
  synthesizeVoice(input: { text: string; voice: string }): Promise<{ audioBase64: string; mimeType: string; durationMs: number }>;
}

export function registerAgentAiRoutes(api: FastifyInstance, pairing: PairingManager, service?: AgentAiService): void {
  api.post("/v1/agent/ai/recognize", async (request, reply) => {
    if (!await pairedOwner(request.headers.authorization, pairing)) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    if (!service) return reply.code(503).send({ code: "AI_SERVICE_NOT_CONFIGURED" });
    const input = z.object({ audioUrl: z.string().url(), language: z.enum(["auto", "zh", "en"]), provider: z.enum(["gemini-audio", "openrouter-stt"]) }).parse(request.body);
    return service.recognize(input);
  });
  api.post("/v1/agent/ai/translate", async (request, reply) => {
    if (!await pairedOwner(request.headers.authorization, pairing)) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    if (!service) return reply.code(503).send({ code: "AI_SERVICE_NOT_CONFIGURED" });
    const input = z.object({ segments: z.array(segmentSchema).min(1).max(500) }).parse(request.body);
    return service.translateSegments(input.segments);
  });
  api.post("/v1/agent/ai/voice", async (request, reply) => {
    if (!await pairedOwner(request.headers.authorization, pairing)) return reply.code(401).send({ code: "DEVICE_UNAUTHORIZED" });
    if (!service) return reply.code(503).send({ code: "AI_SERVICE_NOT_CONFIGURED" });
    const input = z.object({ text: z.string().min(1).max(100_000), voice: z.string().min(1).max(100) }).parse(request.body);
    return service.synthesizeVoice(input);
  });
}

async function pairedOwner(header: string | undefined, pairing: PairingManager): Promise<string | null> {
  if (!header?.startsWith("Bearer ")) return null;
  return (await pairing.authenticateDevice(header.slice(7)))?.ownerId ?? null;
}
