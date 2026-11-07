"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnimeEpisode } from "@/lib/types";
import {
  CAROUSEL_EDGE_FADE_LEFT_CLASS,
  CAROUSEL_EDGE_FADE_RIGHT_CLASS,
  CAROUSEL_NAV_BUTTON_CLASS,
} from "./carousel-ui";
import EpisodeCard from "./EpisodeCard";
import { useCarouselScroll } from "./use-carousel-scroll";

/**
 * Episodes section for the anime details page — horizontal carousel of
 * episode cards beneath the hero. Reuses the shared carousel behavior
 * (native scroll, glass nav arrows, edge fades) from the homepage rows.
 *
 * - Section heading "Episodes" on the left, aligned with hero content.
 * - Episode cards: 16:9 thumbnails with E# badge and duration badge.
 * - Native horizontal scrolling (hidden scrollbar, overscroll containment).
 * - Smooth page-by-page navigation via chevron buttons.
 * - Skeleton loading state while episodes fetch.
 * - Graceful empty/error handling.
 */
interface EpisodesCarouselProps {
  episodes: AnimeEpisode[] | null;
  isLoading: boolean;
  error: boolean;
  anilistId: number;
}

/** Minimal shape for skeleton placeholders. */
interface EpisodeSkeletonItem {
  episode: number;
}

export default function EpisodesCarousel({
  episodes,
  isLoading,
  error,
  anilistId,
}: EpisodesCarouselProps) {
  // Show skeletons while loading; clamp to a reasonable number
  const skeletonCount = 8;
  const displayEpisodes: (AnimeEpisode | EpisodeSkeletonItem)[] = isLoading
    ? Array.from({ length: skeletonCount }, (_, i) => ({ episode: i + 1 }))
    : [...(episodes ?? [])]
        .filter(
          (ep): ep is AnimeEpisode =>
            typeof ep.globalEpisodeNumber === "number" &&
            ep.globalEpisodeNumber > 0,
        )
        .sort((a, b) => a.globalEpisodeNumber - b.globalEpisodeNumber);

  const { scrollerRef, canScrollLeft, canScrollRight, scrollByPage } =
    useCarouselScroll(displayEpisodes.length);

  // Build a user-friendly label from the first/last visible episode numbers
  // using the continuous global episode number. (Only reached when not
  // loading, so every entry is a real AnimeEpisode.)
  const firstEp = (displayEpisodes[0] as AnimeEpisode)?.globalEpisodeNumber ?? 1;
  const lastEp =
    (displayEpisodes[displayEpisodes.length - 1] as AnimeEpisode)
      ?.globalEpisodeNumber ?? firstEp;
  const listLabel = `Episodes ${firstEp}–${lastEp}`;

  return (
    <section
      aria-labelledby="episodes-heading"
      className="relative w-full bg-[#050507] overflow-hidden"
    >
      <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
        <div className="details-section">
          <h2
            id="episodes-heading"
            className="mb-5 details-section-heading"
          >
            Episodes
          </h2>

          {isLoading ? (
            <p className="text-sm text-white/50" aria-live="polite">
              Loading episodes…
            </p>
          ) : error ? (
            <p className="text-sm text-white/50">
              Failed to load episodes.{" "}
              <a
                href={`/anime/${anilistId}`}
                className="underline hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
              >
                Retry
              </a>
            </p>
          ) : displayEpisodes.length === 0 ? (
            <p className="text-sm text-white/50">
              No episodes available for this title.
            </p>
          ) : (
            <>
              <div className="relative mt-4 -mb-8 sm:mt-5 sm:-mb-12">
                <ul
                  ref={scrollerRef}
                  role="list"
                  aria-label={listLabel}
                  className="details-section-carousel no-scrollbar flex gap-5 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-16 pt-4 sm:gap-6 sm:px-10 sm:pb-20 lg:gap-7 lg:px-16 xl:px-24"
                >
                  {displayEpisodes.map((ep) => {
                    // Only real AnimeEpisode entries reach the non-skeleton
                    // branch, so narrow the type for the episode fields.
                    const episode = ep as AnimeEpisode;
                    return isLoading ? (
                      <EpisodeSkeleton key={episode.episode} />
                    ) : (
                      <EpisodeCard
                        key={episode.globalEpisodeNumber}
                        episode={episode}
                        anilistId={anilistId}
                      />
                    );
                  })}
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Skeleton for a single episode card — mirrors EpisodeCard dimensions. */
function EpisodeSkeleton() {
  return (
    <li className="group relative shrink-0 w-[320px] sm:w-[300px] md:w-[340px] lg:w-[360px]">
      <article
        aria-hidden="true"
        className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
      />
      <div className="mt-3 px-1 space-y-2">
        <div className="h-5 w-3/4 rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite]" />
        <div className="h-4 w-5/6 rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite]" />
        <div className="h-4 w-1/2 rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite]" />
      </div>
    </li>
  );
}