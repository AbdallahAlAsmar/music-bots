function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function primarySearchQuery(query: string): string {
  const trimmed = query.trim();
  const pipeIndex = trimmed.indexOf("|");
  if (pipeIndex === -1) {
    return trimmed;
  }
  return trimmed.slice(0, pipeIndex).trim() || trimmed;
}

export function scoreSearchCandidate(query: string, title: string, author = ""): number {
  const normalizedQuery = normalizeSearchText(primarySearchQuery(query));
  const normalizedCandidate = normalizeSearchText(`${title} ${author}`);
  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  if (normalizedCandidate.includes(normalizedQuery)) {
    return normalizedQuery.length * 4;
  }

  const queryTokens = normalizedQuery.split(" ").filter((token) => token.length > 1);
  if (!queryTokens.length) {
    return 0;
  }

  let score = 0;
  for (const token of queryTokens) {
    if (normalizedCandidate.includes(token)) {
      score += token.length;
    }
  }

  return score;
}

export function pickBestSearchIndex<T>(
  items: T[],
  query: string,
  getTitle: (item: T) => string,
  getAuthor: (item: T) => string = () => ""
): number {
  if (!items.length) {
    return -1;
  }

  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    const score = scoreSearchCandidate(query, getTitle(item), getAuthor(item));
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}
