import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentCheckpoint, AgentStateStore } from "./store.js";

interface PersistedState { deviceToken?: string; connection?: { apiUrl: string; deviceId: string }; checkpoints: AgentCheckpoint[] }

export class JsonAgentStateStore implements AgentStateStore {
  private readonly path: string;
  private operations: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) { this.path = join(directory, "agent-state.json"); }

  async saveDeviceToken(encryptedToken: Buffer): Promise<void> {
    await this.enqueue(async () => {
      const state = await this.readDirect();
      state.deviceToken = encryptedToken.toString("base64");
      await this.write(state);
    });
  }
  async loadDeviceToken(): Promise<Buffer | null> {
    await this.operations;
    const token = (await this.readDirect()).deviceToken;
    return token ? Buffer.from(token, "base64") : null;
  }
  async saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void> {
    await this.enqueue(async () => {
      const state = await this.readDirect();
      state.checkpoints = state.checkpoints.filter((item) => item.jobId !== checkpoint.jobId);
      state.checkpoints.push(checkpoint);
      await this.write(state);
    });
  }
  async listCheckpoints(): Promise<AgentCheckpoint[]> { await this.operations; return (await this.readDirect()).checkpoints; }
  async saveConnection(connection: { apiUrl: string; deviceId: string }): Promise<void> {
    await this.enqueue(async () => { const state = await this.readDirect(); state.connection = connection; await this.write(state); });
  }
  async loadConnection(): Promise<{ apiUrl: string; deviceId: string } | null> { await this.operations; return (await this.readDirect()).connection ?? null; }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(() => undefined, () => undefined);
    return result;
  }
  private async readDirect(): Promise<PersistedState> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<PersistedState>;
      return { ...(parsed.deviceToken ? { deviceToken: parsed.deviceToken } : {}), ...(parsed.connection ? { connection: parsed.connection } : {}), checkpoints: parsed.checkpoints ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { checkpoints: [] };
      throw error;
    }
  }
  private async write(state: PersistedState): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.path);
  }
}
