import type { SearchCard, SearchResponse } from "./types";
import { pickSimilarResults } from "./text-similarity";

/**
 * Browser-side search client.
 *
 * This is the SINGLE entry point every search surface uses (navbar popup
 * today; designed for more categories when the backend grows them). All
 * traffic flows through the frontend's restricted proxy `/api/[...path]`
 * (`search` is allowlisted) which injects `x-api-key` server-side — the
 * secret never reaches the browser.
 *
 * Request-protection rules (task parts 2/5/9):
 *  - callers own debouncing/cancellation; this module takes an AbortSignal
 *    and never retries (a failed request surfaces as an error outcome);
 *  - the fallback pool is fetched at most once per session and shared
 *    across queries (module-level cache — one logical fetch, not one per
 *    misspelling), so a misspelled query costs ≤ 2 unique requests;
 *  - nothing sensitive is stored: only normalized anime cards.
 */

/** Query below this length is a hint, not a search (no request is made). */
export const SEARCH_MIN_QUERY_LENGTH = 2;
/** Debounce window for the popup's search input. */
export const SEARCH_DEBOUNCE_MS = 400;
/** Input is clamped to the backend's documented `q` limit (≤200 chars). */
export const SEARCH_QUERY_MAX_LENGTH = 200;
/** Results requested from the primary exact search. */
export const SEARCH_PER_PAGE = 20;
/** Cap of "closest matches" shown by the typo-tolerant fallback. */
export const SIMILAR_RESULTS_MAX = 6;

/** The one category the backend currently supports (see SEARCH_CATEGORIES). */
export const SEARCH_ANIME_CATEGORY = "anime" as const;

/** Absolute /search URL for the given query (Enter / deep-link semantics). */
export function buildSearchUrl(query: string): string {
  return `/search?q=${encodeURIComponent(query.trim())}`;
}

export function isSearchQueryTooShort(query: string): boolean {
  return query.trim().length < SEARCH_MIN_QUERY_LENGTH;
}

/** Outcome of one logical search (primary + optional pool fallback). */
export type SearchOutcome =
  | { kind: "results"; results: SearchCard[]; total: number | null }
  | { kind: "similar"; results: SearchCard[]; total: number | null }
  | { kind: "empty" }
  | { kind: "error"; message: string };

/* ---- Pool cache ------------------------------------------------------------
   The fallback pool (`perPage=50&sort=POPULARITY_DESC`, no `q`) is identical
   data for every misspelled query on a category — fetching it once per session
   keeps misspelled searches at ≤ 2 unique backend requests. Backend TTL for
   this listing is MEDIUM (300s); the client-side entry expires just before. */

const POOL_TTL_MS = 280_000;

interface PoolCacheEntry {
  fetchedAt: number;
  results: SearchCard[];
}

let poolCache: PoolCacheEntry | null = null;

/** Test seam: forget the shared pool (tests re-run the flow from scratch). */
export function clearSearchPoolForTesting(): void {
  poolCache = null;
}

/* ---- Fetch helpers --------------------------------------------------------- */

async function fetchSearch(
  path: string,
  signal: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    type UpstreamError = {
      error?: { message?: string; code?: string };
    } | null;
    const body = payload as UpstreamError;
    const code = body?.error?.code;
    const message =
      typeof body?.error?.message === "string" && body.error.message.length > 0
        ? body.error.message
        : `Search failed (HTTP ${response.status}${code ? `, ${code}` : ""}).`;
    const error = new Error(message);
    error.name = "SearchHttpError";
    throw error;
  }
  const parsed = payload as SearchResponse | null;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as SearchResponse).results)
  ) {
    const error = new Error("Search returned an unexpected response.");
    error.name = "SearchShapeError";
    throw error;
  }
  return parsed;
}

/** Run one logical search. Throws ONLY when the caller's signal aborted. */
export async function searchAnimeByQuery(
  query: string,
  signal: AbortSignal,
): Promise<SearchOutcome> {
  const trimmed = query.trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
  if (trimmed.length < SEARCH_MIN_QUERY_LENGTH) {
    // Callers normally short-circuit earlier; a defensive empty outcome avoids
    // any accidental request for stray whitespace.
    return { kind: "empty" };
  }

  // ---- Primary: exact search (backend AniList SEARCH_MATCH ranking) -------
  const primary = await fetchSearch(
    `/api/search?q=${encodeURIComponent(trimmed)}&perPage=${SEARCH_PER_PAGE}`,
    signal,
  );
  if (signal.aborted) return { kind: "empty" };
  if (primary.results.length > 0) {
    return {
      kind: "results",
      results: primary.results,
      total: primary.pageInfo?.total ?? primary.results.length,
    };
  }

  // ---- Fallback: popularity pool + local similarity ranking ---------------
  const now = Date.now();
  if (!poolCache || now - poolCache.fetchedAt > POOL_TTL_MS) {
    const pool = await fetchSearch(`/api/search?perPage=50&sort=POPULARITY_DESC`, signal);
    poolCache = { fetchedAt: now, results: pool.results };
  }
  if (signal.aborted) return { kind: "empty" };

  const similar = pickSimilarResults(trimmed, poolCache.results, SIMILAR_RESULTS_MAX);
  if (similar.length > 0) {
    return { kind: "similar", results: similar.map((entry) => entry.card), total: null };
  }
  return { kind: "empty" };
}
