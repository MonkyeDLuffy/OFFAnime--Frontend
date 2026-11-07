"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import type { AnimeEpisode } from "@/lib/types";

/**
 * Landscape episode card for the episodes carousel.
 *
 * - 16:9 thumbnail with episode number badge (bottom-left) and
 *   duration badge (bottom-right).
 * - Title + clamped overview below the image.
 * - THE WHOLE CARD IS A SINGLE LINK to the episode's watch page —
 *   `/anime/:id/watch?ep=N&language=sub` — reusing the site's one URL
 *   structure: `:id` is the AniList ID of the details route, `ep` carries
 *   the backend's canonical `globalEpisodeNumber` (the exact parameter the
 *   watch page and stream resolver consume — never a season-local number),
 *   and `language` defaults to `sub` (the watch route's own default, same
 *   as PopularCard / ContinueWatching / the hero Play button).
 * - Premium hover: a subtle zoom of the artwork INSIDE its fixed 16:9
 *   frame plus a gentle border + brightness highlight. Transform/filter
 *   only, 300–500ms ease-out, no overshoot easing, no card lift or scale,
 *   so hover can never shift card positions, push neighbors, or interfere
 *   with clicking. The carousel's nav arrows sit above the row (z-40, see
 *   carousel-ui) and keep working independently.
 * - Fixed aspect-ratio frame prevents layout shift while image loads.
 */
export default function EpisodeCard({
  episode,
  anilistId,
}: {
  episode: AnimeEpisode;
  /** AniList ID of the anime whose details page is being viewed. */
  anilistId: number;
}) {
  const [failedCount, setFailedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const candidates = [episode.image].filter((url): url is string =>
    isOptimizableImageUrl(url)
  );

  const current =
    failedCount < candidates.length ? candidates[failedCount] : null;

  // Display number: the continuous global count with season-local fallback.
  const episodeNumber = episode.globalEpisodeNumber ?? episode.episodeNumber ?? episode.episode ?? 0;
  // Navigation number: ALWAYS the canonical global episode number — the same
  // identity the watch page selects and resolves streams with.
  const watchUrl = `/anime/${anilistId}/watch?ep=${episode.globalEpisodeNumber}&language=sub`;
  const runtime = episode.runtime ?? null;
  const runtimeText = runtime ? `${runtime}m` : null;

  return (
    <li className="group relative shrink-0 w-[320px] sm:w-[300px] md:w-[340px] lg:w-[360px]">
      <Link
        href={watchUrl}
        prefetch={false}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90"
      >
        <article
          className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] duration-300 ease-out group-hover:border-white/25 group-hover:shadow-[0_20px_45px_rgba(0,0,0,0.65)] group-focus-within:border-white/25 group-focus-within:shadow-[0_20px_45px_rgba(0,0,0,0.65)]"
        >
          <div className="relative aspect-video overflow-hidden rounded-xl">
            {current ? (
              <Image
                key={current}
                src={current}
                alt=""
                fill
                sizes="(min-width: 1280px) 360px, (min-width: 768px) 340px, 300px"
                quality={90}
                draggable={false}
                onLoad={() => setIsLoaded(true)}
                onError={() => {
                  setFailedCount((count) => count + 1);
                  setIsLoaded(false);
                }}
                className={`object-cover object-center transition-[opacity,transform,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-[1.06] ${
                  isLoaded ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : (
              <span
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background: getFallbackGradient(
                    `ep:${episode.globalEpisodeNumber}:${episode.title}`
                  ),
                }}
              />
            )}

            {/* Episode number badge — bottom-left */}
            <span
              aria-hidden="true"
              className="absolute left-2 bottom-2 z-10 rounded-full bg-[#050507]/90 backdrop-blur-sm px-2 py-0.5 type-label text-[11px] text-white/90 transition-opacity duration-200 group-hover:opacity-100"
            >
              E{episodeNumber}
            </span>

            {/* Duration badge — bottom-right */}
            {runtimeText ? (
              <span
                aria-hidden="true"
                className="absolute right-2 bottom-2 z-10 rounded-full bg-[#050507]/90 backdrop-blur-sm px-2 py-0.5 type-label text-[11px] text-white/90 transition-opacity duration-200 group-hover:opacity-100"
              >
                {runtimeText}
              </span>
            ) : null}

            {/* Subtle bottom gradient for badge readability */}
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#050507]/60 via-[#050507]/10 to-transparent"
            />
          </div>

          {/* Text content below image */}
          <div className="mt-3 px-1">
            <h3 className="type-display truncate text-[19px] text-white/90 transition-colors duration-200 group-hover:text-white">
              {episode.title}
            </h3>
            {episode.overview ? (
              <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/55">
                {episode.overview}
              </p>
            ) : null}
          </div>
        </article>
      </Link>
    </li>
  );
}
