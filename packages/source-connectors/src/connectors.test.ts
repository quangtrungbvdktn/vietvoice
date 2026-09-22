import { describe, expect, it } from "vitest";
import {
  ConnectorError,
  LocalConnector,
  PlatformConnector,
  normalizeCandidates,
  type SourceCandidate,
} from "./index.js";

function candidate(overrides: Partial<SourceCandidate>): SourceCandidate {
  return {
    sourceIdentity: "yt:base",
    contentFingerprint: "fp-base",
    title: "Tập 1",
    sourceKind: "youtube",
    sourceUri: "https://youtube.com/watch?v=base",
    durationMs: 60_000,
    episodeNumber: null,
    ...overrides,
  };
}

describe("normalizeCandidates", () => {
  it("deduplicates one platform item but preserves different videos named episode 1", () => {
    const result = normalizeCandidates([
      candidate({ sourceIdentity: "yt:abc", title: "Tap 1.mp4" }),
      candidate({ sourceIdentity: "yt:abc", title: "Episode 01" }),
      candidate({ sourceIdentity: "local:def", title: "Episode 01", sourceKind: "local" }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.episodeNumber)).toEqual([1, 1]);
  });

  it("marks matching content fingerprints and keeps missing duration explicit", () => {
    const result = normalizeCandidates([
      candidate({ sourceIdentity: "yt:a", contentFingerprint: "same", durationMs: null }),
      candidate({ sourceIdentity: "local:b", contentFingerprint: "same", sourceKind: "local" }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.possibleDuplicate)).toBe(true);
    expect(result[0]?.durationMs).toBeNull();
  });
});

describe("connector boundaries", () => {
  it("streams local probe results", async () => {
    const connector = new LocalConnector({
      scanFolder: async function* () {
        yield { path: "C:\\Phim\\Tap 02.mp4", durationMs: 91_000, sizeBytes: 20 };
      },
    });
    const items: SourceCandidate[] = [];
    for await (const item of connector.scan({ kind: "local", path: "C:\\Phim" }, { signal: new AbortController().signal })) items.push(item);

    expect(items[0]).toMatchObject({ title: "Tap 02.mp4", episodeNumber: 2, durationMs: 91_000 });
  });
  it("flags renamed local copies without merging their source identities", async () => { const connector=new LocalConnector({scanFolder:async function*(){yield{path:"C:\\A\\Tap 01.mp4",durationMs:91_000,sizeBytes:20};yield{path:"D:\\B\\Episode 01.mp4",durationMs:91_000,sizeBytes:20};}}); const scanned:SourceCandidate[]=[]; for await(const item of connector.scan({kind:"local",path:"C:\\A"},{signal:new AbortController().signal}))scanned.push(item); const result=normalizeCandidates(scanned); expect(result).toHaveLength(2); expect(result.every(item=>item.possibleDuplicate)).toBe(true); });

  it("maps an unauthorized platform response without bypass behavior", async () => {
    const connector = new PlatformConnector("douyin", {
      scan: async function* () { throw new Error("login required"); },
    });

    await expect(async () => {
      for await (const _ of connector.scan({ kind: "url", url: "https://douyin.com/user/abc" }, { signal: new AbortController().signal })) { /* consume */ }
    }).rejects.toMatchObject({ code: "SOURCE_AUTH_REQUIRED" } satisfies Partial<ConnectorError>);
  });
});
