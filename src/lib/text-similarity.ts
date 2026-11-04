import type { SearchCard } from "./types";

/**
 * Typo-tolerance scorer for the search fallback.
 *
 * The backend's only search endpoint (`GET /api/search`, AniList SEARCH_MATCH)
 * requires whole-token matches: misspellings ("naroto", "demom slayer") return
 * `total: 0` even when a popular title obviously exists. The frontend builds
 * its tolerance fallback from REAL backend data only — a popularity-ranked
 * pool fetched from the same endpoint (no `q`, sorted POPULARITY_DESC) which
 * is then scored and ranked locally here. No synthetic titles are ever shown;
 * when nothing scores above the acceptance floor, the UI shows a clean empty
 * state instead.
 *
 * Parts 5/9 rules: "implement a sensible frontend fallback using returned
 * search metadata only when sufficient results are available" — so weak pairs
 * are dropped, not forced into the list.
 */

/**
 * Normalize a title/query into lowercase tokens (letters + numbers only).
 * Punctuation ("JUJUTSU KAISEN 0", ": Kimetsu no Yaiba") must not dilute
 * token similarity.
 */
export function normalizeSearchTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Jaro-Winkler string similarity in [0, 1]. Winkler's prefix boost matters
 * here: "naroto"→"naruto" and "bochi"→"bocchi" share long common prefixes,
 * which is exactly the class of typo this fallback covers.
 */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Match window: characters beyond this distance apart can never match.
  const window = Math.max(a.length, b.length) / 2 - 1;
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const lo = Math.max(0, Math.floor(i - window));
    const hi = Math.min(b.length - 1, Math.floor(i + window));
    for (let j = lo; j <= hi; j += 1) {
      // Order matters: every a[i] pair has at most one b[j] partner.
      if (!bFlags[j] && a[i] === b[j]) {
        aFlags[i] = true;
        bFlags[j] = true;
        matches += 1;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  // Transpositions among the matched pairs (order of flags traversal).
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  transpositions /= 2;

  const jaro =
    (matches / a.length +
      matches / b.length +
      (matches - transpositions) / matches) /
    3;

  // Winkler prefix boost — up to 4 shared leading characters.
  let prefix = 0;
  const limit = Math.min(4, a.length, b.length);
  while (prefix < limit && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Per-token acceptance floor:
 *  - long tokens (the interesting typo space) accept the Jaro-Winkler
 *    neighborhood (1-2 adjacent edits survive, unrelated words don't);
 *  - short tokens (≤3 chars: "gok", "feb") reject almost everything except
 *    near-exact matches, otherwise they would surface unrelated hits.
 */
const LONG_TOKEN_FLOOR = 0.78;
const SHORT_TOKEN_FLOOR = 0.92;
const SHORT_TOKEN_MAX_LENGTH = 3;

function tokenFloor(token: string): number {
  return token.length <= SHORT_TOKEN_MAX_LENGTH
    ? SHORT_TOKEN_FLOOR
    : LONG_TOKEN_FLOOR;
}

/** Score one alias variant against the query. Returns null when rejected. */

/**
 * Variant tokens much shorter than the query token accept almost anything
 * inside the generous Jaro match window ("naroto" vs "art" scores 0.83 —
 * all 3 characters of a 3-char token can land within ±2 positions of a
 * 6-char one). Those degenerate pairs must not surface as "similar"
 * results; require the shorter token to be at least this fraction of the
 * longer one. Real typo pairs (naruto/naroto, piece/pice, demon/demom)
 * stay far above this threshold.
 */
const MIN_TOKEN_LENGTH_RATIO = 0.6;

function scoreVariant(query: string, variant: string): number | null {
  const queryTokens = normalizeSearchTokens(query);
  if (queryTokens.length === 0) return null;
  const variantTokens = normalizeSearchTokens(variant);
  if (variantTokens.length === 0) return null;

  let sum = 0;
  for (const queryToken of queryTokens) {
    const floor = tokenFloor(queryToken);
    let best = 0;
    for (const variantToken of variantTokens) {
      const shorter = Math.min(queryToken.length, variantToken.length);
      const longer = Math.max(queryToken.length, variantToken.length);
      if (shorter / longer < MIN_TOKEN_LENGTH_RATIO) continue;
      const score = jaroWinkler(queryToken, variantToken);
      if (score > best) best = score;
    }
    if (best < floor) return null; // AND policy — one bad token rejects the alias
    sum += best;
  }
  const mean = sum / queryTokens.length;
  // Small ordinal bonus for popular titles whose rank likely matches intent:
  // none — ordering is purely mean similarity; AniList popularity stays the
  // honest tiebreaker inside pickSimilarResults.
  return mean;
}

/** Alias strings of a card that the fallback may score against. */
export function searchCardVariants(card: SearchCard): string[] {
  return [card.titleEnglish, card.titleRomaji, card.title, card.titleNative].flatMap(
    (variant) => (typeof variant === "string" && variant.length > 0 ? [variant] : []),
  );
}

/** Highest accepted similarity for a card against the query, or null. */
export function searchCardSimilarity(query: string, card: SearchCard): number | null {
  let best: number | null = null;
  for (const variant of searchCardVariants(card)) {
    const score = scoreVariant(query, variant);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best;
}

export interface RankedCard {
  card: SearchCard;
  /** Mean token similarity used only for ordering (accepted == non-null). */
  score: number;
}

/**
 * Score + rank a pool of cards against a query, returning only accepted
 * near-matches (>= one token floor each) ordered by mean similarity desc,
 * popular-first on ties (stable AniList order). Max output bounded here so
 * the UI stays a "similar titles" strip, not a wall.
 */
export function pickSimilarResults(
  query: string,
  pool: SearchCard[],
  max: number,
): RankedCard[] {
  const ranked: RankedCard[] = [];
  for (let index = 0; index < pool.length; index += 1) {
    const score = searchCardSimilarity(query, pool[index]!);
    if (score !== null) ranked.push({ card: pool[index]!, score });
  }
  // Descending mean similarity. Array#sort is stable, so ties keep the
  // upstream popularity order of the pool.
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, max);
}
