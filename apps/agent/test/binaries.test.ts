import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyBinaryChecksum } from "../src/main/binaries.js";

describe("bundled binary verification", () => {
  it("accepts the declared SHA-256 and rejects a mismatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vietvoice-bin-"));
    const binary = join(directory, "ffmpeg.exe");
    await writeFile(binary, "trusted-binary");
    const checksum = createHash("sha256").update("trusted-binary").digest("hex");

    await expect(verifyBinaryChecksum(binary, checksum)).resolves.toBeUndefined();
    await expect(verifyBinaryChecksum(binary, "0".repeat(64))).rejects.toThrow(/checksum/i);
  });
});
