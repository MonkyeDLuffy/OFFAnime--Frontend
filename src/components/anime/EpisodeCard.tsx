"use client";

import Image from "next/image";
import { useState } from "react";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import type { AnimeEpisode } from "@/lib/types";

/**
 * Landscape episode card for the episodes carousel.
 *
 * - 16:9 thumbnail with episode number badge (bottom-left) and
 *   duration badge (bottom-right).
 * - Title + clamped overview below the image.
 * - Premium hover: scale 1.04, brightness boost, subtle glow, title brightening.
 * - GPU-friendly transforms, no layout shift, no neighbor push.
 * - Fixed aspect-ratio frame prevents layout shift while image loads.
 */
export default function EpisodeCard({
  episode,
}: {
  episode: AnimeEpisode;
}) {
  const [failedCount, setFailedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  const candidates = [episode.image].filter((url): url is string =>
    isOptimizableImageUrl(url)
  );

  const current =
    failedCount < candidates.length ? candidates[failedCount] : null;

  const episodeNumber = episode.globalEpisodeNumber ?? episode.episodeNumber ?? episode.episode ?? 0;
  const runtime = episode.runtime ?? null;
  const runtimeText = runtime ? `${runtime}m` : null;

  return (
    <li className="group relative shrink-0 w-[320px] sm:w-[300px] md:w-[340px] lg:w-[360px]">
      <article
        className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-[transform,box-shadow,border-color,filter] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-2 hover:scale-[1.04] hover:border-white/30 hover:shadow-[0_32px_64px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.15)] hover:filter-brightness-[1.08]"
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
              className={`object-cover object-center transition-[opacity,transform,filter] duration-500 ease-out hover:scale-[1.02] hover:filter-brightness-[1.05] ${
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
    </li>
  );
}