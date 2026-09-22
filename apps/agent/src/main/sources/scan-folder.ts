import { opendir } from "node:fs/promises";
import { join } from "node:path";
import type { LocalMediaProbe, LocalScanner } from "@vietvoice/source-connectors";
import { probeMedia } from "./probe-media.js";

const MEDIA_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"]);

export class FolderScanner implements LocalScanner {
  async *scanFolder(path: string, signal: AbortSignal): AsyncIterable<LocalMediaProbe> { yield* walk(path, signal); }
}

async function* walk(path: string, signal: AbortSignal): AsyncIterable<LocalMediaProbe> {
  signal.throwIfAborted();
  const directory = await opendir(path);
  for await (const entry of directory) {
    signal.throwIfAborted();
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(fullPath, signal);
    else if (entry.isFile() && MEDIA_EXTENSIONS.has(extension(entry.name))) yield { path: fullPath, ...(await probeMedia(fullPath, signal)) };
  }
}

function extension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}
