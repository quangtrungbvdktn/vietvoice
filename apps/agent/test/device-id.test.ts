import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("pairing device identity", () => {
  it("creates the UUID in the Electron main process instead of the sandboxed renderer", async () => {
    const source = await readFile(new URL("../src/main/electron.ts", import.meta.url), "utf8");

    expect(source).not.toContain("crypto.randomUUID()");
    expect(source).toContain('from "node:crypto"');
    expect(source).toContain("deviceId: randomUUID()");
  });
});
