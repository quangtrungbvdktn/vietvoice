export interface SecretStorage {
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface AgentCheckpoint {
  jobId: string;
  leaseId: string;
  stage: string;
  lastAcknowledgedSequence: number;
}

export interface AgentStateStore {
  saveDeviceToken(encryptedToken: Buffer): Promise<void>;
  loadDeviceToken(): Promise<Buffer | null>;
  saveCheckpoint(checkpoint: AgentCheckpoint): Promise<void>;
  listCheckpoints(): Promise<AgentCheckpoint[]>;
  saveConnection(connection: { apiUrl: string; deviceId: string }): Promise<void>;
  loadConnection(): Promise<{ apiUrl: string; deviceId: string } | null>;
}
