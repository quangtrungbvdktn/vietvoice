import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AgentAsset { body: Buffer; contentType: string }
export interface AgentAssetStore {
  put(body: Buffer, extension: string): Promise<{ audioUrl: string }>;
  get(token: string): Promise<AgentAsset | null>;
}

const CONTENT_TYPES: Record<string, string> = { flac: "audio/flac", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4" };

export class FileAgentAssetStore implements AgentAssetStore {
  constructor(private readonly directory: string, private readonly publicBaseUrl: string, private readonly ttlMs: number) {}

  async put(body: Buffer, extension: string): Promise<{ audioUrl: string }> {
    const normalized = extension.toLowerCase();
    if (!CONTENT_TYPES[normalized]) throw new Error("ASSET_EXTENSION_INVALID");
    await mkdir(this.directory, { recursive: true });
    const token = `${randomUUID()}.${normalized}`;
    await writeFile(join(this.directory, token), body, { mode: 0o600 });
    return { audioUrl: `${this.publicBaseUrl.replace(/\/$/, "")}/v1/agent/assets/${token}` };
  }

  async get(token: string): Promise<AgentAsset | null> {
    const match = token.match(/^([a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})\.(flac|wav|mp3|m4a)$/i);
    if (!match) return null;
    const path = join(this.directory, token);
    try {
      const metadata = await stat(path);
      if (Date.now() - metadata.mtimeMs > this.ttlMs) { await unlink(path); return null; }
      return { body: await readFile(path), contentType: CONTENT_TYPES[match[2]!.toLowerCase()]! };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
