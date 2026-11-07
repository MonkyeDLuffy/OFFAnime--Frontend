"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import {
  buildSeasonCards,
  fetchSeasons,
  type SeasonCardModel,
} from "./seasons-data";
import {
  CAROUSEL_EDGE_FADE_LEFT_CLASS,
  CAROUSEL_EDGE_FADE_RIGHT_CLASS,
  CAROUSEL_NAV_BUTTON_CLASS,
} from "./carousel-ui";
import SeasonCard from "./SeasonCard";
import { useCarouselScroll } from "./use-carousel-scroll";

/**
 * SEASONS section for the anime details page — horizontal carousel of the
 * main storyline (prequels → current anime → sequels), placed directly
 * between the Episodes and Recommended Anime sections.
 *
 * Data: `GET /api/seasons/:anilistId` through the SAME-ORIGIN Next.js proxy
 * (`src/app/api/[...path]/route.ts` — path allowlisted for GET, backend API
 * key injected server-side, no browser auth needed). `:anilistId` is the
 * AniList ID of the anime on screen (the details route param) — never a MAL
 * ID, slug or hardcoded literal. External AniList/MAL calls never happen
 * from the browser.
 *
 * Data-flow guarantees (same conventions as RecommendedCarousel):
 * - One request per AniList ID per session: module-level cache dedupes
 *   concurrent in-flight fetches and repeat visits.
 * - Stale-response guard: every effect run is tagged with the id it is for;
 *   responses landing after the anime changed (or after unmount) are
 *   dropped, and derived state only ever reports the CURRENT id — the
 *   previous anime's seasons are never painted while a new request runs.
 * - Refetch happens whenever the AniList ID changes (or on Retry).
 * - Failure evicts the cached promise so Retry performs a real request.
 *
 * Classification (from the verified response shape): the section shows ONLY
 * the main storyline — the self entry `anime` plus `prequels`/`sequels`
 * entries whose `format` is `TV`. Returned groups sideStories, spinOffs,
 * alternativeVersions, parentStory and `other`, and every non-TV entry in
 * prequels/sequels (movies, OVAs/ONAs, specials — observed in the live
 * data) are never labelled as seasons. Chronological order: prequels → the
 * current anime → sequels, with each group sorted by `seasonYear`, then the
 * AniList season (Winter < Spring < Summer < Fall). Season numbers are
 * shown ONLY when they can be parsed reliably from the returned titles;
 * otherwise cards carry the backend's `relationLabel` ("Prequel"/"Sequel").
 * A chain with no TV relations besides the current anime is not a storyline
 * — the section renders nothing (and a total payload failure keeps the
 * details page unaffected, surfacing a section-local Retry like Episodes).
 */

interface SeasonsCarouselProps {
  /** AniList ID of the anime whose details page is being viewed. */
  anilistId: number;
  /**
   * `seasonYear` of the currently viewed anime from the already-fetched
   * details payload — the seasons endpoint's self entry carries no year.
   * Only used to display the year on the current-season card.
   */
  currentSeasonYear: number | null;
}

const REQUIRED_CHAIN_SIZE = 2;

export default function SeasonsCarousel({
  anilistId,
  currentSeasonYear,
}: SeasonsCarouselProps) {
  // Result keyed BY the anime it belongs to: a cached payload for a
  // previously opened anime can never render for the current one.
  const [result, setResult] = useState<{
    id: number;
    cards: SeasonCardModel[];
  } | null>(null);
  const [failedId, setFailedId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchSeasons(anilistId).then((payload) => {
      if (cancelled) return;
      if (payload === null) {
        setFailedId(anilistId);
      } else {
        setResult({ id: anilistId, cards: buildSeasonCards(payload, currentSeasonYear) });
        setFailedId((current) => (current === anilistId ? null : current));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [anilistId, attempt, currentSeasonYear]);

  // Display decisions are ALWAYS derived from the current id.
  const isReady = result?.id === anilistId;
  const isError = failedId === anilistId;
  const isLoading = !isReady && !isError;
  const cards = isReady ? result.cards : [];

  const { scrollerRef, canScrollLeft, canScrollRight, scrollByPage } =
    useCarouselScroll(cards.length);
  const listLabel = "Seasons";

  if (isLoading) {
    return (
      <section
        aria-labelledby="seasons-heading"
        aria-busy="true"
        className="relative w-full bg-[#050507] overflow-hidden"
      >
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <div className="details-section">
            <h2
              id="seasons-heading"
              className="mb-5 details-section-heading details-section-spacing"
            >
              SEASONS
            </h2>
            <p className="sr-only">Loading seasons…</p>
          </div>
          {/* Skeleton row: same card widths/spacing as the real row so the
              content swap causes no layout shift (Trending idiom). */}
          <div
            aria-hidden="true"
            className="mt-8 flex gap-4 overflow-hidden px-6 pt-4 sm:mt-10 sm:gap-5 sm:px-10 lg:gap-6 lg:px-16 xl:px-24"
          >
            {[0, 1, 2, 3, 4, 5].map((slot) => (
              <div
                key={slot}
                className="aspect-[2/3] w-[58vw] max-w-[240px] shrink-0 rounded-xl bg-white/[0.06] motion-safe:animate-pulse sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]"
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section
        aria-labelledby="seasons-heading"
        className="relative w-full bg-[#050507] overflow-hidden"
      >
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <h2
            id="seasons-heading"
            className="mb-5 details-section-heading details-section-spacing"
          >
            SEASONS
          </h2>
          {/* Matches the Episodes/Recommended inline retry treatment. */}
          <p className="text-sm text-white/50">
            Failed to load seasons.{" "}
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="underline hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
            >
              Retry
            </button>
          </p>
        </div>
      </section>
    );
  }

  // No meaningful season relationship for this title → hide the section
  // entirely (never fabricate a season sequence out of side material).
  if (cards.length < REQUIRED_CHAIN_SIZE) {
    return null;
  }

  return (
    <section
      aria-labelledby="seasons-heading"
      className="relative w-full bg-[#050507]"
    >
      <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
        <div className="details-section">
          <h2
            id="seasons-heading"
            className="mb-5 details-section-heading details-section-spacing"
          >
            SEASONS
          </h2>

          {/* Row wrapper — same idiom as PopularRow/EpisodesCarousel: the
              reserved bottom padding hosts the cards' hover lift, and the
              negative bottom margin hands the empty part of that
              reservation back so the next section (Recommended Anime) sits
              a balanced distance below the cards instead of ~200px. */}
          <div className="relative mt-8 -mb-8 sm:mt-10 sm:-mb-12 details-section-carousel">
            <ul
              ref={scrollerRef}
              role="list"
              aria-label={listLabel}
              className="no-scrollbar flex gap-4 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-16 pt-4 sm:gap-5 sm:px-10 sm:pb-20 lg:gap-6 lg:px-16 xl:px-24"
            >
              {cards.map((card) => (
                <SeasonCard key={card.anilistId} card={card} />
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
