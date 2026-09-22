export type SourceKind = "local" | "youtube" | "douyin" | "hongguo";

export type SourceInput =
  | { kind: "local"; path: string }
  | { kind: "url"; url: string };

export interface ScanContext {
  signal: AbortSignal;
  credentialsRef?: string;
}

export interface SourceCandidate {
  sourceIdentity: string;
  contentFingerprint: string;
  sourceKind: SourceKind;
  sourceUri: string;
  title: string;
  durationMs: number | null;
  episodeNumber: number | null;
  possibleDuplicate?: boolean;
  thumbnailUrl?: string;
}

export interface SourceConnector {
  supports(input: SourceInput): boolean;
  scan(input: SourceInput, context: ScanContext): AsyncIterable<SourceCandidate>;
}

export type ConnectorErrorCode = "SOURCE_AUTH_REQUIRED" | "SOURCE_UNSUPPORTED" | "SOURCE_UNAVAILABLE";

export class ConnectorError extends Error {
  constructor(public readonly code: ConnectorErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectorError";
  }
}
