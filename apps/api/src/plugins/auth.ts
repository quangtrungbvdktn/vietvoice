import type { FastifyRequest } from "fastify";

export interface AuthenticatedUser {
  userId: string;
}

export type TokenVerifier = (token: string) => Promise<AuthenticatedUser | null>;

export async function authenticate(
  request: FastifyRequest,
  verifyToken: TokenVerifier,
): Promise<AuthenticatedUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyToken(header.slice(7));
}
