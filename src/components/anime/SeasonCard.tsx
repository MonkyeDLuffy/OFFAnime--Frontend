"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import { describeFormat } from "./PopularCard";
import type { SeasonCardModel } from "./seasons-data";

/**
 * One "SEASONS" card: a portrait poster with the same optical treatment as
 * `PopularCard` (fixed aspect frame, lazy fade-in, optimizer at quality 90,
 * hover lift + image glide, error-advancing image chain) but with a season
 * personality:
 *
 * - Poster chain follows the seasons contract: `images.poster` (large) →
 *   `images.cover` (medium) → `images.banner` → cinematic gradient. Each
 *   failed URL advances the chain exactly once.
 * - A badge on the poster carries the season identity, always data-driven:
 *   "Season N" only when the number can be parsed reliably from the returned
 *   titles, otherwise the backend's own relationship label ("Prequel"/
 *   "Sequel"). Nothing is ever numbered from array position.
 * - The anime currently being viewed is rendered as a static card (not a
 *   link — clicking it would just reload the same page) with a distinct
 *   white "Current Season" badge and a highlighted frame.
 * - A persistent caption strip (title + format · year · episodes) mirrors
 *   the typography of the hover panels in the shared rows, so a season card
 *   still reads identically at rest and while hovered.
 *
 * Navigation uses the established AniList-ID details route (`/anime/:id`)
 * — never the MAL ID.
 */

/** Mirrors PopularCard's poster widths (full card width) for next/image. */
const POSTER_SIZES =
  "(min-width: 1536px) 300px, (min-width: 1280px) 290px, (min-width: 1024px) 280px, (min-width: 768px) 260px, (min-width: 640px) 240px, 58vw";

/** Badge text: season number when reliable, else the relationship label. */
export function seasonBadgeText(card: SeasonCardModel): string | null {
  if (card.isCurrent) {
    return card.seasonNumber ? `Season ${card.seasonNumber} · Current` : "Current Season";
  }
  if (card.seasonNumber !== null) return `Season ${card.seasonNumber}`;
  return card.relationLabel ?? null;
}

export default function SeasonCard({ card }: { card: SeasonCardModel }) {
  const candidates = [
    card.posterUrl,
    card.coverUrl,
    card.bannerUrl,
  ].filter((url): url is string => isOptimizableImageUrl(url));
  const [failedCount, setFailedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  // Clamp guards against the candidate list changing between renders.
  const currentSource =
    failedCount < candidates.length ? candidates[failedCount] : null;

  const metaParts = [
    describeFormat(card.format),
    card.year !== null ? String(card.year) : null,
    card.episodeCount !== null
      ? `${card.episodeCount} ${card.episodeCount === 1 ? "episode" : "episodes"}`
      : null,
  ].filter((part): part is string => part !== null);

  const badge = seasonBadgeText(card);

  const posterClasses = `relative block aspect-[2/3] overflow-hidden rounded-xl border bg-white/[0.04] ${
    card.isCurrent
      ? "border-white/40 shadow-[0_6px_20px_rgba(0,0,0,0.45)] ring-2 ring-white/50"
      : "border-white/10 shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-300 ease-out group-hover/season:border-white/25 group-hover/season:shadow-[0_20px_45px_rgba(0,0,0,0.65)] group-focus-within/season:border-white/25 group-focus-within/season:shadow-[0_20px_45px_rgba(0,0,0,0.65)]"
  }`;

  return (
    <li className="group/season relative z-0 w-[58vw] max-w-[240px] shrink-0 sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]">
      <div className="relative details-anime-card transition-transform duration-300 ease-out group-focus-within/season:-translate-y-1.5 group-focus-within/season:scale-[1.02] group-hover/season:-translate-y-1.5 group-hover/season:scale-[1.02]">
        {card.isCurrent ? (
          // Current anime: deliberately NOT a link — the card represents the
          // page the user is already on — but keeps identical optics.
          <span className={posterClasses}>
            <PosterArt
              source={currentSource}
              cardKey={`${card.anilistId}:${card.title}`}
              isLoaded={isLoaded}
              setLoaded={setIsLoaded}
              advanceChain={() => {
                setFailedCount((count) => count + 1);
                setIsLoaded(false);
              }}
            />
          </span>
        ) : (
          <Link
            href={`/anime/${card.anilistId}`}
            aria-label={card.title}
            prefetch={true}
            className={posterClasses}
          >
            <PosterArt
              source={currentSource}
              cardKey={`${card.anilistId}:${card.title}`}
              isLoaded={isLoaded}
              setLoaded={setIsLoaded}
              advanceChain={() => {
                setFailedCount((count) => count + 1);
                setIsLoaded(false);
              }}
            />
          </Link>
        )}

        {badge ? (
          <span
            className={`absolute left-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm ${
              card.isCurrent
                ? "bg-white text-black shadow-[0_4px_14px_rgba(0,0,0,0.55)]"
                : "bg-black/70 text-white/90 ring-1 ring-white/20"
            }`}
          >
            {badge}
          </span>
        ) : null}

        {/* Persistent caption: title + meta, identical typography to the
            shared hover panels so the row reads as part of the same system. */}
        <div className="mt-3 rounded-xl border border-white/10 bg-[#0b0b11] px-3 pb-3 pt-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <p className="type-label truncate text-[15px] text-white">
            {card.title}
          </p>
          {metaParts.length > 0 ? (
            <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
              {metaParts.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Aspect-framed poster art with the shared fade/glide/fallback behaviour. */
function PosterArt({
  source,
  cardKey,
  isLoaded,
  setLoaded,
  advanceChain,
}: {
  source: string | null;
  cardKey: string;
  isLoaded: boolean;
  setLoaded: (loaded: boolean) => void;
  advanceChain: () => void;
}) {
  if (source) {
    return (
      <Image
        key={source}
        src={source}
        alt=""
        fill
        sizes={POSTER_SIZES}
        quality={90}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={advanceChain}
        className={`object-cover object-center transition-[opacity,transform] duration-500 ease-out group-hover/season:scale-[1.04] ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0"
      style={{ background: getFallbackGradient(cardKey) }}
    />
  );
}
