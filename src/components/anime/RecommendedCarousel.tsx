"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import type { AnimeRecommendation, PopularEntry, TrailerSource } from "@/lib/types";
import {
  CAROUSEL_EDGE_FADE_LEFT_CLASS,
  CAROUSEL_EDGE_FADE_RIGHT_CLASS,
  CAROUSEL_NAV_BUTTON_CLASS,
} from "./carousel-ui";
import PopularCard from "./PopularCard";
import { useCarouselScroll } from "./use-carousel-scroll";

/**
 * Recommended Anime carousel for the anime details page.
 *
 * Data: `GET /api/recommendations/:anilistId` through the SAME-ORIGIN Next.js
 * proxy (`src/app/api/[...path]/route.ts` — path allowlisted for GET, API key
 * injected server-side, no auth needed). `:anilistId` is the AniList ID of
 * the anime currently on screen (the details page's own route param) — never
 * a MAL/TMDB ID or a slug, never a hardcoded literal.
 *
 * Previously the section read an inline `recommendations` array out of the
 * `/api/details/:id` payload — that key no longer exists upstream, so the
 * section rendered "No recommendations available" for every title. The
 * details response is no longer consulted here at all.
 *
 * Data-flow guarantees (live-verified requirements):
 * - One fetch per AniList ID per browser session: a module-level map caches
 *   the RESOLVED entry list and dedupes concurrent in-flight requests, so
 *   revisiting an anime (or instantiating several carousels for it) never
 *   refetches.
 * - Stale-response guard: each effect run is tagged with the id it is for;
 *   a response that lands after the anime changed (or after unmount) is
 *   dropped. Results for a DIFFERENT id can never be applied, and the
 *   derived status only ever reports data for the CURRENT id — the previous
 *   anime's recommendations are never painted while the new request runs.
 * - States: loading (polite text, matching the Episodes section idiom),
 *   empty (backend returned zero entries), error (transport/timeout/4xx —
 *   with an inline retry that bypasses the failed cache entry). No silent
 *   fallback to the details payload.
 *
 * Reuses the exact shared card infrastructure of the homepage rows
 * (PopularCard + PopularRow): poster fallback chain, hover info panel,
 * 700ms trailer popup pipeline, native scroll + glass nav arrows + fades.
 */

interface RecommendedCarouselProps {
  /** AniList ID of the anime whose details page is being viewed. */
  anilistId: number;
}

const REQUEST_TIMEOUT_MS = 12_000;

/**
 * Session-level cache: one in-flight/resolved request per AniList ID.
 * Rejected (transport-broken) promises are evicted so a later mount can
 * retry; consumers always resolve to an array or null.
 */
const recommendationsCache = new Map<
  number,
  Promise<AnimeRecommendation[] | null>
>();

function fetchRecommendations(
  anilistId: number,
): Promise<AnimeRecommendation[] | null> {
  const cached = recommendationsCache.get(anilistId);
  if (cached) return cached;

  const request = (async () => {
    try {
      // Same-origin relative path → the Next.js proxy injects the backend
      // API key; browser credentials/knowledge of the key are unnecessary.
      const response = await fetch(`/api/recommendations/${anilistId}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Failure resolution: drop the cached promise so a retry (or a
        // later navigation) starts a REAL fetch instead of re-serving this
        // null forever.
        recommendationsCache.delete(anilistId);
        return null;
      }
      const payload: unknown = await response.json();

      // VERIFIED upstream shape: a bare JSON array of entries. The
      // `{ recommendations: [...] }` wrapper is accepted defensively in case
      // the backend ever repacks it; unknown keys are ignored.
      const rawEntries = Array.isArray(payload)
        ? payload
        : payload &&
            typeof payload === "object" &&
            Array.isArray(
              (payload as { recommendations?: unknown }).recommendations,
            )
          ? ((payload as { recommendations?: unknown }).recommendations as unknown[])
          : null;
      if (!rawEntries) {
        recommendationsCache.delete(anilistId);
        return null;
      }

      return rawEntries.filter(
        (entry): entry is AnimeRecommendation => {
          if (!entry || typeof entry !== "object") return false;
          const rec = entry as { anilistId?: unknown; id?: unknown };
          return (
            typeof rec.anilistId === "number" &&
            Number.isFinite(rec.anilistId) &&
            rec.anilistId > 0 &&
            (typeof rec.id === "number" || typeof rec.id === "undefined")
          );
        },
      );
    } catch {
      // Transport failure, timeout or non-JSON body are surfaced as the
      // section's error state, never an empty-looking success. Drop the
      // cached promise so a retry performs a real request.
      recommendationsCache.delete(anilistId);
      return null;
    }
  })();

  recommendationsCache.set(anilistId, request);
  request.catch(() => {
    // Promise cannot reject (catch above) — belt-and-braces eviction so a
    // poisoned entry can never stick for the session.
    if (recommendationsCache.get(anilistId) === request) {
      recommendationsCache.delete(anilistId);
    }
  });
  return request;
}

/** Convert a verified recommendation to PopularEntry for the shared card. */
function toPopularEntry(rec: AnimeRecommendation): PopularEntry {
  return {
    anilistId: rec.anilistId,
    title:
      rec.titleEnglish ?? rec.titleRomaji ?? rec.title ?? "Untitled",
    posterUrl: rec.images?.poster ?? null,
    posterFallbackUrl: null,
    format: rec.format ?? null,
    year: rec.seasonYear ?? null,
    episodeCount: rec.episodes ?? null,
    // The endpoint's trailer field is not a verified TrailerSource document;
    // the card renders gracefully without one.
    trailer: null as TrailerSource | null,
  };
}

export default function RecommendedCarousel({
  anilistId,
}: RecommendedCarouselProps) {
  // Result keyed BY the anime it belongs to, so a cached result for a
  // previously opened anime can never render for the current one.
  const [result, setResult] = useState<{
    id: number;
    entries: AnimeRecommendation[];
  } | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Stale-response guard: if another anime's effect run superseded this
    // one (or the card unmounted), its landing response is dropped here.
    let cancelled = false;
    void fetchRecommendations(anilistId).then((entries) => {
      if (cancelled) return;
      if (entries === null) {
        setFailedId(anilistId);
      } else {
        setResult({ id: anilistId, entries });
        setFailedId((current) => (current === anilistId ? null : current));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [anilistId, attempt]);

  // Display decisions are ALWAYS derived from the current id: while a new
  // request is in flight the candidates of the previous anime are not shown.
  const isReady = result?.id === anilistId;
  const isError = failedId === anilistId;
  const isLoading = !isReady && !isError;

  // Recommendation cards: all valid entries the backend returns (there is no
  // configured display limit for this row), invalid ones filtered locally.
  const entries = isReady ? result.entries.map(toPopularEntry) : [];

  const { scrollerRef, canScrollLeft, canScrollRight, scrollByPage } =
    useCarouselScroll(entries.length);

  const listLabel = `Recommended anime`;

  if (isLoading || isError) {
    return (
      <section
        aria-labelledby="recommended-heading"
        className="relative w-full bg-[#050507] overflow-hidden"
      >
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <h2
            id="recommended-heading"
            className="mb-5 type-display text-[27px] sm:text-34px lg:text-40px"
          >
            Recommended Anime
          </h2>
          {isLoading ? (
            <p className="text-sm text-white/50" aria-live="polite">
              Loading recommendations…
            </p>
          ) : (
            /* Matches the Episodes section's inline retry treatment. */
            <p className="text-sm text-white/50">
              Failed to load recommendations.{" "}
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="underline hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              >
                Retry
              </button>
            </p>
          )}
        </div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section
        aria-labelledby="recommended-heading"
        className="relative w-full bg-[#050507] overflow-hidden"
      >
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <h2
            id="recommended-heading"
            className="mb-5 type-display text-[27px] sm:text-34px lg:text-40px"
          >
            Recommended Anime
          </h2>
          <p className="text-sm text-white/50">
            No recommendations available for this title.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="recommended-heading"
      className="relative w-full bg-[#050507]"
    >
      <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
        <div className="details-section">
          <h2
            id="recommended-heading"
            className="mb-5 details-section-heading details-section-spacing"
          >
            Recommended Anime
          </h2>

          <div className="relative mt-8 sm:mt-10 details-section-carousel">
            <ul
              ref={scrollerRef}
              role="list"
              aria-label={listLabel}
              className="no-scrollbar flex gap-4 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-36 pt-4 sm:gap-5 sm:px-10 sm:pb-40 lg:gap-6 lg:px-16 xl:px-24"
            >
              {entries.map((entry) => (
                <PopularCard key={entry.anilistId} entry={entry} />
              ))}
            </ul>

            {canScrollLeft ? (
              <div aria-hidden="true" className={CAROUSEL_EDGE_FADE_LEFT_CLASS} />
            ) : null}
            {canScrollRight ? (
              <div aria-hidden="true" className={CAROUSEL_EDGE_FADE_RIGHT_CLASS} />
            ) : null}

            {canScrollLeft ? (
              <button
                type="button"
                onClick={() => scrollByPage(-1)}
                aria-label={`Scroll ${listLabel} backward`}
                className={`${CAROUSEL_NAV_BUTTON_CLASS} left-3 sm:left-5`}
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
            {canScrollRight ? (
              <button
                type="button"
                onClick={() => scrollByPage(1)}
                aria-label={`Scroll ${listLabel} forward`}
                className={`${CAROUSEL_NAV_BUTTON_CLASS} right-3 sm:right-5`}
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
