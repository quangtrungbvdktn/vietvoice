import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export interface OAuthTokens { accessToken: string; refreshToken?: string; expiresAt: string }
interface EncryptedRecord { iv: string; tag: string; ciphertext: string }
export class EncryptedTokenStore {
  private readonly records = new Map<string, EncryptedRecord>();
  constructor(private readonly key: Buffer) { if (key.byteLength !== 32) throw new Error("TOKEN_KEY_MUST_BE_32_BYTES"); }
  save(id: string, tokens: OAuthTokens) { const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", this.key, iv); const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]); this.records.set(id, { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }); }
  read(id: string): OAuthTokens | null { const record = this.records.get(id); if (!record) return null; const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(record.iv, "base64")); decipher.setAuthTag(Buffer.from(record.tag, "base64")); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8")) as OAuthTokens; }
  serialized(id: string) { return JSON.stringify(this.records.get(id) ?? null); }
}
