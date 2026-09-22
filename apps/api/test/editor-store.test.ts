import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EditorStore } from "../src/routes/editor-store.js";

describe("persistent EditorStore", () => {
  it("restores editor versions and immutable export history after restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-editor-"));
    const path = join(directory, "editor.json");
    const first = new EditorStore(path);
    first.patch("owner:project", 0, { translation: "Xin chào" }, ["translation", "voice_generation"]);
    const exported = first.createExport("owner", "project", { preset: "vertical", resolution: "1080p", quality: "high", frameMode: "crop" });

    const restarted = new EditorStore(path);
    expect(restarted.patch("owner:project", 0, { translation: "Ghi đè" }, ["translation"]))
      .toMatchObject({ conflict: true, current: { version: 1 } });
    expect(restarted.listExports("owner", "project")).toEqual([expect.objectContaining({ id: exported.id, editorVersion: 1 })]);
  });
});
