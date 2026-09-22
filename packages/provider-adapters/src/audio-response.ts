export interface CloudTranscript { text: string; segments: Array<{ startMs: number; endMs: number; text: string }> }

export function parseCloudTranscript(content: string): CloudTranscript {
  const match = content.trim().match(/^(?:```(?:json)?\s*)?([\s\S]*?)(?:\s*```)?$/i);
  try {
    const value = JSON.parse(match?.[1] ?? "") as Partial<CloudTranscript>;
    if (typeof value.text !== "string" || !value.text.trim() || !Array.isArray(value.segments)) throw new Error();
    let previousEnd = 0;
    const segments = value.segments.map((segment) => {
      if (!segment || !Number.isInteger(segment.startMs) || !Number.isInteger(segment.endMs)
        || segment.startMs < previousEnd || segment.endMs <= segment.startMs || typeof segment.text !== "string" || !segment.text.trim()) throw new Error();
      previousEnd = segment.endMs;
      return { startMs: segment.startMs, endMs: segment.endMs, text: segment.text.trim() };
    });
    return { text: value.text.trim(), segments };
  } catch { throw new Error("PROVIDER_RESPONSE_INVALID"); }
}

export async function loadAudio(audioUrl: string, signal: AbortSignal): Promise<{ mimeType: string; base64: string }> {
  const response = await fetch(audioUrl, { signal });
  if (!response.ok) throw new Error("PROVIDER_AUDIO_FETCH_FAILED");
  return { mimeType: response.headers.get("content-type")?.split(";")[0] ?? "audio/wav", base64: Buffer.from(await response.arrayBuffer()).toString("base64") };
}
