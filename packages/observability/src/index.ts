const SECRET_KEY = /authorization|api[-_]?key|(?:access|refresh)?[-_]?token|cookie|signed[-_]?url|credential/i;
const SECRET_QUERY = /signature|credential|security-token|token|api[-_]?key/i;
const WINDOWS_PATH = /^[a-z]:[\\/]/i;
const POSIX_PATH = /^\/(?:Users|home|mnt|media|tmp|var\/tmp)\//;

function redactString(value: string): string {
  if (WINDOWS_PATH.test(value) || POSIX_PATH.test(value)) {
    const basename = value.split(/[\\/]/).filter(Boolean).at(-1) ?? "file";
    return `[LOCAL_PATH]/${basename}`;
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) {
        if (SECRET_QUERY.test(key)) url.searchParams.set(key, "[REDACTED]");
      }
      value = url.toString();
    } catch { /* redact bearer credentials below */ }
  }
  return value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]");
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(child)]));
  }
  return typeof value === "string" ? redactString(value) : value;
}

export function audit(event: string, data: unknown): string {
  const safeData = redact(data);
  return JSON.stringify({ ...(safeData && typeof safeData === "object" ? safeData : { data: safeData }), event });
}
