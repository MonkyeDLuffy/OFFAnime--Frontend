import type { Metadata } from "next";
import SearchResultRow from "@/components/search/SearchResultRow";
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  searchAnimeWithTypoFallback,
} from "@/lib/api";
import type { SearchRequestOutcome } from "@/lib/api";

/**
 * Dedicated search results page (GET /search?q=…).
 *
 * Reached by pressing Enter in the navbar search popup (or by URL directly —
 * refresh keeps the query because it lives in the URL). Server-rendered: the
 * backend's per-query cache (TTL MEDIUM) plus this page's Data Cache
 * (searchAnimeWithTypoFallback) keep repeated visits cheap — no AniList
 * quota burn.
 *
 * Semantics:
 *  - the FULL query is fetched fresh here (nothing stale is inherited from a
 *    popup debounce that Enter interrupted);
 *  - typo tolerance = the backend's exact search first, then ONE popularity-
 *    pool request scored locally on real results (SearchRequestOutcome
 *    "similar") — never invented metadata;
 *  - honest loading (loading.tsx), empty and error states; no auto-retries;
 *  - rows are the shared SearchResultRow (expand/lazy details behave
 *    identically to the popup).
 */

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = sanitizeQuery(q);
  return {
    title: query.length > 0 ? `Search: ${query}` : "Search",
    description:
      "Search anime titles on OFFAnime — exact matches first, typo-tolerant similar results after.",
  };
}

/** Shared sanitize rule (page + metadata): trim, hard-limit to backend `q`. */
function sanitizeQuery(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, SEARCH_QUERY_MAX_LENGTH);
}

/** Category tabs rendered from REAL backend capability only — today exactly
    one (anime). More categories require backend endpoints (a TMDB multi-search,
    a manga search); the record in src/lib/search-client.ts is the seam. */
function SearchTabs({ query }: { query: string }) {
  return (
    <div className="search-tabs" role="tablist" aria-label="Search categories">
      <button
        type="button"
        role="tab"
        aria-selected="true"
        tabIndex={-1}
        className="search-tab search-tab--active type-label"
        aria-label={
          query.length > 0 ? `Anime results for ${query}` : "Anime search"
        }
      >
        Anime
      </button>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = sanitizeQuery(q);
  const tooShort =
    query.length > 0 && query.length < SEARCH_MIN_QUERY_LENGTH;

  let outcome: SearchRequestOutcome | null = null;
  if (!tooShort && query.length >= SEARCH_MIN_QUERY_LENGTH) {
    outcome = await searchAnimeWithTypoFallback(query);
  }

  return (
    <main className="pb-24">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-28 sm:px-8 sm:pt-32">
        <h1 className="type-display text-[30px] sm:text-36px lg:text-40px">Search</h1>
        <p className="type-label mt-1.5 text-[13px] text-white/45 sm:text-sm">
          {query.length > 0
            ? `Results for “${query}”`
            : "Find anime titles across OFFAnime"}
        </p>

        <div className="mt-5">
          <SearchTabs query={query} />
        </div>

        <div className="search-scroll mt-4 min-h-[240px] rounded-2xl border border-white/10 bg-white/[0.02] px-1.5 py-2 sm:px-2.5">
          {!query ? (
            <p className="search-hint">
              Type a title above — reach this page by pressing{" "}
              <kbd className="search-kbd">Enter</kbd> in the navbar search (shortcut{" "}
              <kbd className="search-kbd">/</kbd>).
            </p>
          ) : tooShort ? (
            <p className="search-hint">
              Please use at least {SEARCH_MIN_QUERY_LENGTH} characters.
            </p>
          ) : outcome === null ? null : outcome.kind === "error" ? (
            <div className="search-state" role="alert">
              <p className="search-state-title">Search failed</p>
              <p className="search-state-text">
                The search service did not respond. Try again in a moment.
              </p>
              {/* GET form retry — no JS, no auto-retry loop. */}
              <form action="/search" method="get" className="mt-3">
                <input type="hidden" name="q" value={query} />
                <button
                  type="submit"
                  className="glass-btn glass-btn--dark type-label px-4 py-2 text-sm"
                >
                  Retry
                </button>
              </form>
            </div>
          ) : outcome.kind === "empty" ? (
            <div className="search-state">
              <p className="search-state-title">No results for “{query}”</p>
              <p className="search-state-text">
                Check the spelling or try a broader title.
              </p>
            </div>
          ) : (
            <>
              {outcome.kind === "similar" ? (
                <p className="search-similar-note">
                  No exact match — closest matches for “{query}”
                </p>
              ) : (
                <p className="text-[13px] text-white/40">
                  {outcome.total} result{outcome.total === 1 ? "" : "s"}
                </p>
              )}
              <ul className="search-rows" aria-label="Search results">
                {outcome.results.map((card, index) => (
                  <SearchResultRow key={card.anilistId} index={index} card={card} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
