"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { Info, Play } from "lucide-react";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import type { PopularEntry } from "@/lib/types";
import TrailerPopup from "./TrailerPopup";
import WatchLaterButton from "./WatchLaterButton";
import { useTrailerPreview } from "./use-trailer-preview";

/** Mirrors the poster widths in PopularCard (full card width) for next/image. */
const POSTER_SIZES =
  "(min-width: 1536px) 300px, (min-width: 1280px) 290px, (min-width: 1024px) 280px, (min-width: 768px) 260px, (min-width: 640px) 240px, 58vw";

/** Raw AniList format values → compact display labels. */
export function describeFormat(format: string | null): string | null {
  if (!format) return null;
  switch (format) {
    case "TV":
    case "OVA":
    case "ONA":
      return format;
    case "TV_SHORT":
      return "TV Short";
    case "MOVIE":
      return "Movie";
    case "SPECIAL":
      return "Special";
    case "MUSIC":
      return "Music";
    default:
      return format;
  }
}

/**
 * One "Popular Anime" card (the Trending row reuses it): a clean, image-
 * focused portrait poster that elevates on hover/focus, reveals an info
 * panel (Play / Watch Later / Info) below, and — after a 700ms hover —
 * expands into a Netflix-style trailer popup.
 *
 * - The panel is absolutely positioned and slides out of the poster's bottom
 *   edge into the carousel's reserved bottom padding, so the row never jumps
 *   vertically, the expanded card is never clipped by the scroller's
 *   overflow clip, and no layout shift occurs. While the trailer popup is
 *   open the panel stays unmounted — the popup carries the same actions.
 * - The card lifts above its neighbours (hover/focus z-index) so the slight
 *   scale and panel overlap them cleanly without overlapping collisions.
 * - Posters load lazily behind a fixed aspect-ratio frame (no layout
 *   shift), fade in on load, and fall back large poster → medium cover →
 *   cinematic gradient, with each failed URL advancing the chain exactly
 *   once (never retried). The optimizer encodes at quality 90 (not the
 *   default 75) so the text-heavy posters stay crisp at card size.
 * - Play and Info use the established `/anime/:id` navigation; Watch Later
 *   reuses the shared store (toggle + duplicate handling).
 * - Hover previews: the popup (see TrailerPopup) opens only after a 700ms
 *   mouse hover and plays the official trailer carried by the card's own
 *   `/api/home` payload (no extra requests). Touch users tap to open the
 *   preview on the first tap and navigate with a second tap or the popup's
 *   buttons, so normal navigation is never broken. A missing or failed
 *   trailer keeps the poster — nothing is ever fabricated.
 */
export default function PopularCard({ entry }: { entry: PopularEntry }) {
  const candidates = [entry.posterUrl, entry.posterFallbackUrl].filter(
    (url): url is string => isOptimizableImageUrl(url),
  );
  const [failedCount, setFailedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  // The click decision needs the pointer type of the tap that produced it
  // (touch taps open the preview instead of navigating); every pointerdown
  // refreshes it, so a stale type can never hijack a later click.
  const pointerTypeRef = useRef<string>("mouse");
  const {
    isActive,
    exiting,
    previewSource,
    anchorRef,
    popupRef,
    onPointerEnter,
    onPointerLeave,
    onPopupPointerEnter,
    onPopupPointerLeave,
    openPreviewFromTap,
    discardTrailer,
  } = useTrailerPreview(entry.trailer, entry.posterUrl);
  // Clamp guards against a candidates list shrinking between renders (ISR).
  const current =
    failedCount < candidates.length ? candidates[failedCount] : null;

  const detailsUrl = `/anime/${entry.anilistId}`;
  const watchUrl = `/anime/${entry.anilistId}/watch?ep=1&language=sub`;
  const metaParts = [
    describeFormat(entry.format),
    entry.year !== null ? String(entry.year) : null,
    entry.episodeCount !== null
      ? `${entry.episodeCount} ${entry.episodeCount === 1 ? "episode" : "episodes"}`
      : null,
  ].filter((part): part is string => part !== null);

  return (
    <li
      ref={anchorRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={(event) => {
        pointerTypeRef.current = event.pointerType;
      }}
      className="group/pop relative z-0 w-[58vw] max-w-[240px] shrink-0 focus-within:z-30 hover:z-30 sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]"
    >
      <div
        className="relative transition-transform duration-300 ease-out group-focus-within/pop:-translate-y-1.5 group-focus-within/pop:scale-[1.02] group-hover/pop:-translate-y-1.5 group-hover/pop:scale-[1.02] details-anime-card"
      >
        <Link
          href={detailsUrl}
          aria-label={entry.title}
          prefetch={true}
          onClick={(event) => {
            // Keyboard activation (detail 0) and mouse clicks navigate as
            // always; a touch tap opens the preview on the first tap and
            // navigates on the second (or via the popup's own buttons).
            if (event.detail === 0) return;
            if (pointerTypeRef.current === "mouse") return;
            if (openPreviewFromTap()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 group-hover/pop:border-white/25 group-hover/pop:shadow-[0_20px_45px_rgba(0,0,0,0.65)] group-focus-within/pop:border-white/25 group-focus-within/pop:shadow-[0_20px_45px_rgba(0,0,0,0.65)]"
        >
          {current ? (
            <Image
              key={current}
              src={current}
              alt=""
              fill
              sizes={POSTER_SIZES}
              quality={90}
              draggable={false}
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                setFailedCount((count) => count + 1);
                setIsLoaded(false);
              }}
              className={`object-cover object-center transition-[opacity,transform] duration-500 ease-out group-hover/pop:scale-[1.04] ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: getFallbackGradient(
                  `${entry.anilistId}:${entry.title}`,
                ),
              }}
            />
          )}
        </Link>

        {/* Info panel — overlaps the poster's bottom rounded corners so the
            expanded card reads as one unit; hidden state keeps it out of the
            pointer flow, hover/focus reveals it (keyboard focus included).
            Unmounted while the trailer popup is open: the popup owns the
            same actions, so duplicate controls never stack up. */}
        {!isActive ? (
          <div
            className={`pointer-events-none absolute inset-x-0 top-[calc(100%-12px)] z-10 -translate-y-1 rounded-b-xl border border-t-0 border-white/10 bg-[#0b0b11] px-3 pb-3 pt-2.5 opacity-0 shadow-[0_18px_40px_rgba(0,0,0,0.6)] transition-[opacity,transform] duration-300 ease-out delay-100 group-hover/pop:pointer-events-auto group-hover/pop:translate-y-0 group-hover/pop:opacity-100 group-focus-within/pop:pointer-events-auto group-focus-within/pop:translate-y-0 group-focus-within/pop:opacity-100`}
          >
            <p className="type-label truncate text-[17px] text-white">
              {entry.title}
            </p>
            {metaParts.length > 0 ? (
              <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
                {metaParts.join(" · ")}
              </p>
            ) : null}
            <div className="mt-2.5 flex items-center gap-2">
              <Link
                href={watchUrl}
                aria-label={`Play ${entry.title}`}
                title="Play"
                className="glass-btn glass-btn--bright flex h-11 w-11 items-center justify-center rounded-full"
              >
                <Play className="h-5 w-5 fill-current" aria-hidden="true" />
              </Link>
              <WatchLaterButton
                slide={{
                  anilistId: entry.anilistId,
                  title: entry.title,
                  posterUrl: entry.posterUrl,
                  year: entry.year,
                  format: entry.format,
                }}
                className="h-11 w-11"
              />
              <Link
                href={detailsUrl}
                aria-label={`More information about ${entry.title}`}
                title="More information"
                className="glass-btn flex h-11 w-11 items-center justify-center rounded-full text-white"
              >
                <Info className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      {/* Delayed hover preview — portaled to <body> so the scroller's
          overflow clip can never cut it off; anchored to this card. The
          shell stays mounted through its exit animation (players already
          released the moment the slot frees up). */}
      {isActive || exiting ? (
        <TrailerPopup
          entry={entry}
          metaLabel={metaParts.length > 0 ? metaParts.join(" · ") : null}
          anchorRef={anchorRef}
          popupRef={popupRef}
          source={previewSource}
          closing={exiting && !isActive}
          onPointerEnter={onPopupPointerEnter}
          onPointerLeave={onPopupPointerLeave}
          onFailed={discardTrailer}
        />
      ) : null}
    </li>
  );
}
