import { basename } from "node:path";
import { createHash } from "node:crypto";
import { detectEpisodeNumber } from "./normalize.js";
import { ConnectorError, type ScanContext, type SourceCandidate, type SourceConnector, type SourceInput } from "./types.js";

export interface LocalMediaProbe { path: string; durationMs: number | null; sizeBytes: number }
export interface LocalScanner { scanFolder(path: string, signal: AbortSignal): AsyncIterable<LocalMediaProbe> }

export class LocalConnector implements SourceConnector {
  constructor(private readonly scanner: LocalScanner) {}
  supports(input: SourceInput): boolean { return input.kind === "local"; }

  async *scan(input: SourceInput, context: ScanContext): AsyncIterable<SourceCandidate> {
    if (input.kind !== "local") throw new ConnectorError("SOURCE_UNSUPPORTED", "Nguồn này không phải thư mục cục bộ.");
    for await (const media of this.scanner.scanFolder(input.path, context.signal)) {
      const title = basename(media.path.replaceAll("\\", "/"));
      const identity = createHash("sha256").update(media.path.toLocaleLowerCase()).digest("hex");
      const fingerprint = createHash("sha256").update(`${media.sizeBytes}:${media.durationMs ?? "unknown"}`).digest("hex");
      yield { sourceIdentity: `local:${identity}`, contentFingerprint: fingerprint, sourceKind: "local", sourceUri: media.path, title, durationMs: media.durationMs, episodeNumber: detectEpisodeNumber(title) };
    }
  }
}
