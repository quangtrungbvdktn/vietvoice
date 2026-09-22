import type { SourceCandidate } from "./types.js";

export function detectEpisodeNumber(title: string): number | null {
  const match = title.match(/(?:t[aậ]p|tap|episode|ep)[\s._-]*0*(\d{1,5})/iu);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

export function normalizeCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
  const identities = new Set<string>();
  const unique = candidates.filter((candidate) => {
    if (identities.has(candidate.sourceIdentity)) return false;
    identities.add(candidate.sourceIdentity);
    return true;
  });
  const fingerprintCounts = new Map<string, number>();
  for (const item of unique) fingerprintCounts.set(item.contentFingerprint, (fingerprintCounts.get(item.contentFingerprint) ?? 0) + 1);
  return unique.map((item) => ({
    ...item,
    episodeNumber: item.episodeNumber ?? detectEpisodeNumber(item.title),
    possibleDuplicate: (fingerprintCounts.get(item.contentFingerprint) ?? 0) > 1,
  }));
}
