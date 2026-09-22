import { detectEpisodeNumber } from "./normalize.js";
import { ConnectorError, type ScanContext, type SourceCandidate, type SourceConnector, type SourceInput, type SourceKind } from "./types.js";

export interface PlatformItem { id: string; title: string; url: string; durationMs: number | null; fingerprint?: string; thumbnailUrl?: string }
export interface PlatformScanner { scan(url: string, context: ScanContext): AsyncIterable<PlatformItem> }

function platformForUrl(url: string): SourceKind | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
    if (host.endsWith("douyin.com")) return "douyin";
    if (host.includes("hongguo")) return "hongguo";
  } catch { return null; }
  return null;
}

export class PlatformConnector implements SourceConnector {
  constructor(public readonly platform: Exclude<SourceKind, "local">, private readonly scanner: PlatformScanner) {}
  supports(input: SourceInput): boolean { return input.kind === "url" && platformForUrl(input.url) === this.platform; }

  async *scan(input: SourceInput, context: ScanContext): AsyncIterable<SourceCandidate> {
    if (input.kind !== "url" || !this.supports(input)) throw new ConnectorError("SOURCE_UNSUPPORTED", `Liên kết không thuộc nguồn ${this.platform}.`);
    try {
      for await (const item of this.scanner.scan(input.url, context)) {
        yield { sourceIdentity: `${this.platform}:${item.id}`, contentFingerprint: item.fingerprint ?? `${this.platform}:${item.id}`, sourceKind: this.platform, sourceUri: item.url, title: item.title, durationMs: item.durationMs, episodeNumber: detectEpisodeNumber(item.title), ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}) };
      }
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const requiresAuth = /login|required|cookie|unauthori[sz]ed|forbidden|private/i.test(message);
      throw new ConnectorError(requiresAuth ? "SOURCE_AUTH_REQUIRED" : "SOURCE_UNAVAILABLE", requiresAuth ? `Nguồn ${this.platform} yêu cầu đăng nhập hoặc cấp quyền hợp lệ.` : `Không thể quét nguồn ${this.platform}. Vui lòng thử lại.`, { cause: error });
    }
  }
}

export { platformForUrl };
