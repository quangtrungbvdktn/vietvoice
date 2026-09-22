import { rm } from "node:fs/promises";
import { CleanupManifest } from "@vietvoice/media-core";

export async function cleanupUnreferenced(paths: string[], manifest: CleanupManifest): Promise<string[]> {
  const removed: string[] = [];
  for (const path of paths) {
    if (!manifest.canDelete(path)) continue;
    await rm(path, { force: true });
    removed.push(path);
  }
  return removed;
}
