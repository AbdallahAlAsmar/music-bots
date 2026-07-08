import play from "play-dl";
import { pickBestSearchIndex } from "./search-match.js";

const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const SEARCH_TIMEOUT_MS = 15_000;

export interface YoutubeSearchHit {
  title: string;
  url: string;
  duration: string;
  thumbnail: string | null;
  durationSeconds?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
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

export function extractYoutubeVideoId(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
    }

    const byQuery = parsed.searchParams.get("v") ?? "";
    if (YOUTUBE_VIDEO_ID_RE.test(byQuery)) {
      return byQuery;
    }

    const path = parsed.pathname.replace(/^\/+/, "");
    const parts = path.split("/");
    if (parts.length >= 2 && ["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
      const id = parts[1] ?? "";
      return YOUTUBE_VIDEO_ID_RE.test(id) ? id : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function canonicalYoutubeVideoUrl(url: string): string | null {
  const id = extractYoutubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function parseDurationToSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === "Live") {
    return undefined;
  }

  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return undefined;
  }

  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }

  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }

  return undefined;
}

function isRetryableLookupError(message: string): boolean {
  const normalized = message.toLowerCase();
  return ["timeout", "timed out", "econnreset", "enotfound", "429", "too many requests"].some((token) =>
    normalized.includes(token)
  );
}

export async function searchYoutube(query: string): Promise<YoutubeSearchHit> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const results = await withTimeout(
        play.search(query, { source: { youtube: "video" }, limit: 10 }),
        SEARCH_TIMEOUT_MS,
        "YouTube search"
      );

      if (!results.length) {
        throw new Error(`No results found for "${query}"`);
      }

      const bestIndex = pickBestSearchIndex(
        results,
        query,
        (candidate) => candidate.title ?? "",
        () => ""
      );
      const best = results[bestIndex];
      if (!best?.url) {
        throw new Error(`No valid result found for "${query}".`);
      }
      const canonical = canonicalYoutubeVideoUrl(best.url);
      if (!canonical) {
        throw new Error(`No valid result found for "${query}".`);
      }

      return {
        title: best.title ?? "Unknown Title",
        url: canonical,
        duration: best.durationRaw ?? "Live",
        thumbnail: best.thumbnails?.at(-1)?.url ?? null,
        durationSeconds: parseDurationToSeconds(best.durationRaw)
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < 2 && isRetryableLookupError(lastError.message)) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`Search failed for "${query}"`);
}
