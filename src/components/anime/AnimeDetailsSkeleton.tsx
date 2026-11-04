"use client";

import { useEffect, useState } from "react";

/**
 * Premium skeleton for the anime details page. Mirrors the real layout
 * (banner → left column with logo / genres / title / buttons / description
 * lines, right info panel with four rows, then the Episodes and Recommended
 * Anime sections below the fold) so the transition from skeleton to content
 * produces almost no layout shift.
 *
 * Dark gray gradients with a subtle, slow shimmer — consistent with the
 * OFFAnime theme, never bright white flashing.
 */

/** One shimmering gradient track. `animated` is disabled for
    prefers-reduced-motion users so nothing flashes or pulses. */
function ShimmerTrack({
  className,
  animated,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-full w-full rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""} ${className ?? ""}`}
    />
  );
}

/** A rounded rectangular shimmer block of a given size. */
function ShimmerBlock({
  h,
  w,
  className,
  animated,
}: {
  h: string;
  w: string;
  className?: string;
  animated?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-xl ${className ?? ""} style-[--h:${h};--w:${w}]`}
      style={{ height: `var(--h)`, width: `var(--w)` }}
    >
      <ShimmerTrack animated={animated} />
    </span>
  );
}

/** Landscape episode thumbnail skeleton, mirroring EpisodeCard dimensions. */
function EpisodeSkeleton({ animated }: { animated: boolean }) {
  return (
    <li
      aria-hidden="true"
      className="group relative shrink-0 w-[320px] sm:w-[300px] md:w-[340px] lg:w-[360px]"
    >
      <article
        className={`relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""} shadow-[0_8px_24px_rgba(0,0,0,0.5)]`}
      />
      <div className="mt-3 px-1 space-y-2">
        <ShimmerBlock h="5" w="3/4" className="rounded" animated={animated} />
        <ShimmerBlock h="4" w="5/6" className="rounded" animated={animated} />
        <ShimmerBlock h="4" w="1/2" className="rounded" animated={animated} />
      </div>
    </li>
  );
}

/** Vertical recommendation card skeleton, mirroring PopularCard dimensions. */
function RecommendationCardSkeleton({ animated }: { animated: boolean }) {
  return (
    <li
      aria-hidden="true"
      className="group/pop relative z-0 w-[58vw] max-w-[240px] shrink-0 sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]"
    >
      <div
        className={`relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""} shadow-[0_6px_20px_rgba(0,0,0,0.45)]`}
      />
      <div className="mt-2 space-y-2">
        <ShimmerBlock h="5" w="full" className="rounded sm:h-6" animated={animated} />
        <ShimmerBlock h="4" w="3/4" className="rounded sm:h-5" animated={animated} />
        <div className="flex flex-wrap gap-2">
          <ShimmerBlock h="10" w="44" className="rounded-full sm:h-11 sm:w-11" animated={animated} />
          <ShimmerBlock h="10" w="44" className="rounded-full sm:h-11 sm:w-11" animated={animated} />
          <ShimmerBlock h="10" w="44" className="rounded-full sm:h-11 sm:w-11" animated={animated} />
        </div>
      </div>
    </li>
  );
}

export default function AnimeDetailsSkeleton() {
  // Disable the sweeping shimmer for users who request reduced motion.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = () => setReduced(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  const animated = !reduced;

  return (
    <section
      className="relative flex min-h-[100svh] w-full flex-col bg-[#050507]"
      aria-label="Loading anime details"
    >
      {/* Banner skeleton — full-width, cover-shaped, with a bottom fade that
          matches the real page so the blend is stable during loading. */}
      <div className="absolute inset-0 z-0">
        <ShimmerBlock h="100%" w="100%" className="rounded-none" animated={animated} />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[30%] bg-[linear-gradient(to_top,#050507_0%,#050507_4%,rgba(5,5,7,0.86)_20%,rgba(5,5,7,0.58)_42%,rgba(5,5,7,0.3)_64%,rgba(5,5,7,0.1)_84%,rgba(5,5,7,0)_100%)]"
        />
      </div>

      {/* Content skeleton — matches the real row's bottom-pinned geometry. */}
      <div className="relative z-20 mt-auto w-full px-6 pb-14 pt-40 sm:px-10 sm:pb-16 lg:px-16 lg:pb-20 xl:px-24">
        <div className="flex w-full flex-col gap-7 sm:gap-9 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          {/* Left column skeleton — logo, genres, title, buttons, description lines. */}
          <div className="min-w-0 lg:w-[60%]">
            <ShimmerBlock h="96px" w="min(580px,84vw)" className="mt-3 sm:h-[114px] lg:h-[148px]" animated={animated} />
            <ShimmerBlock h="16px" w="40%" className="mt-3 sm:mt-[2px] sm:h-6 lg:h-7" animated={animated} />
            <ShimmerBlock h="24px" w="min(320px,60vw)" className="mt-2 text-lg sm:mt-3 sm:text-xl lg:text-[26px]" animated={animated} />
            <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7 sm:gap-3">
              <ShimmerBlock h="52px" w="220px" className="sm:h-[52px]" animated={animated} />
              <ShimmerBlock h="52px" w="52px" className="sm:h-[52px]" animated={animated} />
              <ShimmerBlock h="52px" w="150px" className="sm:h-[52px]" animated={animated} />
            </div>
            <ShimmerBlock h="20px" w="560px" className="mt-5 opacity-60 sm:mt-6 sm:h-[22px]" animated={animated} />
            <ShimmerBlock h="20px" w="440px" className="mt-3 opacity-50 sm:mt-4 sm:h-[22px]" animated={animated} />
          </div>

          {/* Right column skeleton — info panel with four rows. */}
          <aside className="relative w-full max-w-[340px] self-start sm:max-w-[320px] lg:max-w-[300px] lg:self-end">
            <ShimmerBlock h="72px" w="100%" className="rounded-2xl" animated={animated} />
            <ShimmerBlock h="20px" w="70%" className="mt-3 opacity-60 sm:mt-4 sm:h-[22px]" animated={animated} />
            <ShimmerBlock h="20px" w="45%" className="mt-3 opacity-50 sm:mt-4 sm:h-[22px]" animated={animated} />
            <ShimmerBlock h="20px" w="55%" className="mt-3 opacity-60 sm:mt-4 sm:h-[22px]" animated={animated} />
            <ShimmerBlock h="20px" w="40%" className="mt-3 opacity-50 sm:mt-4 sm:h-[22px]" animated={animated} />
          </aside>
        </div>
      </div>

      {/* Episodes section skeleton — heading + landscape thumbnails + text lines. */}
      <section className="relative w-full bg-[#050507]">
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <div className="details-section">
            <ShimmerBlock
              h="24px"
              w="min(260px,60vw)"
              className="mb-5 sm:mb-[32px] text-3xl sm:text-[40px] lg:text-4xl"
              animated={animated}
            />
            <div
              className="relative mt-4 -mb-8 sm:mt-5 sm:-mb-12 details-section-carousel"
            >
              <ul
                role="list"
                aria-label="Episodes"
                className="no-scrollbar flex gap-5 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-16 pt-4 sm:gap-6 sm:px-10 sm:pb-20 lg:gap-7 lg:px-16 xl:px-24"
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <EpisodeSkeleton key={index} animated={animated} />
                ))}
              </ul>

              {/* Glass nav-arrow placeholders keep the carousel's reserved
                  space stable while loading. */}
              <div
                aria-hidden="true"
                className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0b0b11]/80 backdrop-blur ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""}`}
              />
              <div
                aria-hidden="true"
                className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0b0b11]/80 backdrop-blur ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""}`}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Recommended Anime section skeleton — heading + vertical card skeletons. */}
      <section className="relative w-full bg-[#050507]">
        <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
          <div className="details-section details-section-spacing">
            <ShimmerBlock
              h="24px"
              w="min(320px,70vw)"
              className="mb-5 sm:mb-[32px] text-3xl sm:text-[40px] lg:text-4xl"
              animated={animated}
            />
            <div className="relative mt-8 sm:mt-10 details-section-carousel">
              <ul
                role="list"
                aria-label="Recommended Anime"
                className="no-scrollbar flex gap-4 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-36 pt-4 sm:gap-5 sm:px-10 sm:pb-40 lg:gap-6 lg:px-16 xl:px-24"
              >
                {Array.from({ length: 6 }).map((_, index) => (
                  <RecommendationCardSkeleton key={index} animated={animated} />
                ))}
              </ul>

              <div
                aria-hidden="true"
                className={`absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0b0b11]/80 backdrop-blur ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""}`}
              />
              <div
                aria-hidden="true"
                className={`absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border border-white/10 bg-[#0b0b11]/80 backdrop-blur ${animated ? "animate-[shimmer_3s_ease-in-out_infinite]" : ""}`}
              />
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
