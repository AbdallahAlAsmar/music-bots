import { getLyrics } from "genius-lyrics-api";

const LYRICS_LOOKUP_TIMEOUT_MS = 15_000;
const LYRICS_PAGE_LIMIT = 3900;
const LRCLIB_SEARCH_URL = "https://lrclib.net/api/search";

export interface LyricsLookupSource {
  title: string;
  sourceQuery?: string;
  durationSeconds?: number;
  artistName?: string;
  albumName?: string;
}

export interface SyncedLyricLine {
  timeMs: number;
  text: string;
}

export interface SyncedLyricsResult {
  trackName: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  lines: SyncedLyricLine[];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Lyrics lookup timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function clipLyrics(lyrics: string): string {
  return lyrics.length > LYRICS_PAGE_LIMIT ? `${lyrics.slice(0, LYRICS_PAGE_LIMIT)}...` : lyrics;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/official video/gi, "")
    .replace(/official audio/gi, "")
    .replace(/lyric video/gi, "")
    .replace(/lyrics/gi, "")
    .replace(/4k/gi, "")
    .replace(/hd/gi, "")
    .trim();
}

function normalizeQuery(query: string): string {
  return cleanTitle(query).replace(/\s+/g, " ").trim();
}

function uniqueValues(values: Array<string | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || result.includes(normalized)) {
      continue;
    }
    result.push(normalized);
  }
  return result;
}

function buildQueryCandidates(source: LyricsLookupSource): string[] {
  return uniqueValues([
    source.sourceQuery,
    source.title,
    normalizeQuery(source.sourceQuery ?? ""),
    normalizeQuery(source.title)
  ]);
}

function scoreResult(
  item: { trackName?: string; artistName?: string; albumName?: string; duration?: number },
  source: LyricsLookupSource,
  candidateQuery: string
): number {
  let score = 0;

  if (typeof source.durationSeconds === "number" && Number.isFinite(source.durationSeconds) && typeof item.duration === "number") {
    score += Math.abs(item.duration - source.durationSeconds) * 100;
  }

  const normalizedTrackName = normalizeQuery(item.trackName ?? "");
  const normalizedTitle = normalizeQuery(source.title);
  const normalizedQuery = normalizeQuery(candidateQuery);

  if (normalizedTrackName && normalizedTrackName === normalizedTitle) {
    score -= 600;
  }
  if (normalizedTrackName && normalizedTrackName === normalizedQuery) {
    score -= 500;
  }

  return score;
}

async function searchLrclib(source: LyricsLookupSource): Promise<Array<{
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  plainLyrics?: string;
  syncedLyrics?: string;
  instrumental?: boolean;
}>> {
  const candidates = buildQueryCandidates(source);
  for (const candidate of candidates) {
    const url = `${LRCLIB_SEARCH_URL}?q=${encodeURIComponent(candidate)}`;
    try {
      const response = await withTimeout(fetch(url, { headers: { Accept: "application/json" } }), LYRICS_LOOKUP_TIMEOUT_MS);
      if (!response.ok) {
        continue;
      }

      const data = (await response.json()) as Array<{
        trackName?: string;
        artistName?: string;
        albumName?: string;
        duration?: number;
        plainLyrics?: string;
        syncedLyrics?: string;
        instrumental?: boolean;
      }>;
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch {
      continue;
    }
  }

  return [];
}

function parseSyncedLyrics(syncedLyrics: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = [];
  for (const rawLine of syncedLyrics.split(/\r?\n/)) {
    const match = rawLine.match(/^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]\s*(.*)$/);
    if (!match) {
      continue;
    }

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const fraction = Number((match[3] ?? "0").padEnd(3, "0"));
    const text = (match[4] ?? "").trim();
    if (!text && lines.length === 0) {
      continue;
    }

    lines.push({
      timeMs: minutes * 60_000 + seconds * 1_000 + fraction,
      text
    });
  }

  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

async function fetchFromLrclib(source: LyricsLookupSource): Promise<string | null> {
  const results = await searchLrclib(source);
  const match = results
    .filter((item) => typeof item.plainLyrics === "string" && item.plainLyrics.trim().length > 0)
    .sort((a, b) => scoreResult(a, source, source.sourceQuery ?? source.title) - scoreResult(b, source, source.sourceQuery ?? source.title))[0];

  return match?.plainLyrics ? clipLyrics(match.plainLyrics.trim()) : null;
}

export async function fetchSyncedLyrics(source: LyricsLookupSource): Promise<SyncedLyricsResult | null> {
  const results = await searchLrclib(source);
  const candidateQuery = source.sourceQuery ?? source.title;

  const match = results
    .filter(
      (item) =>
        !item.instrumental &&
        typeof item.syncedLyrics === "string" &&
        item.syncedLyrics.trim().length > 0 &&
        typeof item.trackName === "string" &&
        item.trackName.trim().length > 0
    )
    .sort((a, b) => scoreResult(a, source, candidateQuery) - scoreResult(b, source, candidateQuery))[0];

  if (!match?.syncedLyrics || !match.trackName) {
    return null;
  }

  const lines = parseSyncedLyrics(match.syncedLyrics);
  if (!lines.length) {
    return null;
  }

  return {
    trackName: match.trackName,
    artistName: match.artistName,
    albumName: match.albumName,
    duration: match.duration,
    lines
  };
}

export async function fetchLyrics(source: LyricsLookupSource): Promise<string | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;

  if (token) {
    try {
      const lyrics = await withTimeout(
        getLyrics({
          apiKey: token,
          title: source.title,
          artist: "",
          optimizeQuery: true
        }),
        LYRICS_LOOKUP_TIMEOUT_MS
      );
      if (lyrics) {
        return clipLyrics(lyrics);
      }
    } catch {
      // Fall through to LRCLIB.
    }
  }

  return fetchFromLrclib(source);
}
