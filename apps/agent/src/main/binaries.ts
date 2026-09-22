import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";

export async function verifyBinaryChecksum(path: string, expectedSha256: string): Promise<void> {
  await verifyFileChecksum(path, expectedSha256, "CHECKSUM_MISMATCH");
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(path);
    input.on("data", (chunk) => hash.update(chunk));
    input.once("error", reject);
    input.once("end", resolve);
  });
  return hash.digest("hex");
}

export async function verifyFileChecksum(path: string, expectedSha256: string, errorCode: string): Promise<void> {
  if (!/^[a-f\d]{64}$/i.test(expectedSha256)) throw Object.assign(new Error(errorCode), { code: errorCode });
  let actualHex: string;
  try {
    actualHex = await sha256File(path);
  } catch (error) {
    throw Object.assign(new Error(errorCode), { code: (error as NodeJS.ErrnoException).code === "ENOENT" ? "FILE_MISSING" : errorCode });
  }
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedSha256.toLowerCase(), "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error(errorCode), { code: errorCode });
  }
}
