import { describe, expect, it } from "vitest";
import { audit, redact } from "./index.js";

describe("structured redaction", () => {
  it("removes nested credentials, signed URL secrets, and absolute local paths", () => {
    expect(redact({
      headers: { authorization: "Bearer secret", apiKey: "key-123" },
      inputPath: "C:\\Users\\mai\\Videos\\episode-01.mp4",
      upload: "https://storage.example/file?X-Amz-Signature=abc&safe=yes&token=bad",
    })).toEqual({
      headers: { authorization: "[REDACTED]", apiKey: "[REDACTED]" },
      inputPath: "[LOCAL_PATH]/episode-01.mp4",
      upload: "https://storage.example/file?X-Amz-Signature=%5BREDACTED%5D&safe=yes&token=%5BREDACTED%5D",
    });
  });

  it("keeps the audit event and correlation id stable", () => {
    expect(JSON.parse(audit("job.failed", { correlationId: "corr-7", accessToken: "secret" }))).toEqual({
      event: "job.failed",
      correlationId: "corr-7",
      accessToken: "[REDACTED]",
    });
  });
});
