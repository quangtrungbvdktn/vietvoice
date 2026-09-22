import type { PlatformItem, PlatformScanner, ScanContext } from "@vietvoice/source-connectors";
import { collectProcess } from "./probe-media.js";

interface YtDlpEntry { id?: string; title?: string; webpage_url?: string; duration?: number; thumbnail?: string; entries?: YtDlpEntry[] }

export class YtDlpScanner implements PlatformScanner {
  async *scan(url: string, context: ScanContext): AsyncIterable<PlatformItem> {
    const version = (await collectProcess("yt-dlp", ["--version"], context.signal)).trim();
    if (!version) throw new Error("yt-dlp version unavailable");
    const output = await collectProcess("yt-dlp", ["--dump-single-json", "--skip-download", "--no-warnings", url], context.signal);
    const root = JSON.parse(output) as YtDlpEntry;
    for (const item of root.entries ?? [root]) {
      if (!item.id || !item.title) continue;
      yield { id: item.id, title: item.title, url: item.webpage_url ?? url, durationMs: typeof item.duration === "number" ? Math.round(item.duration * 1000) : null, ...(item.thumbnail ? { thumbnailUrl: item.thumbnail } : {}) };
    }
  }
}
