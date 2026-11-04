"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Play, Video, Volume2, VolumeX, X } from "lucide-react";
import type { Anime, HeroSlide, TrailerSource } from "@/lib/types";
import BackdropImage from "./BackdropImage";
import DetailsInfoPanel from "./DetailsInfoPanel";
import SlideLogo, { TitleHeading } from "./SlideLogo";
import TrailerPreview from "./TrailerPreview";
import WatchLaterButton from "./WatchLaterButton";
import { getDisplayGenresJoined } from "@/lib/anime";

/**
 * Cinematic full-viewport details hero for `/anime/[id]`.
 *
 * Layers (bottom → top):
 *   1. The anime's banner (TMDB banner/backdrop → AniList banner → cover →
 *      poster → cinematic gradient — the same server-resolved candidate chain
 *      as the homepage hero, consumed through the shared BackdropImage with
 *      its client-side onError fallbacks). object-cover, never stretched.
 *   2. The trailer background (optional) — the Watch Trailer toggle mounts
 *      the shared TrailerPreview over the banner; it fades in only once
 *      playback is actually running, so the banner stays visible until then.
 *      Playback starts unmuted (when the browser permits it), and a dedicated
 *      liquid-glass mute toggle sits bottom-right of the trailer area.
 *      A failed embed restores the banner by switching the toggle off — the
 *      banner is never unmounted, so there is no flash and no layout shift.
 *   3. Shared scrims: a left readability scrim behind the content, a top
 *      vignette under the floating navbar, and the homepage's bottom fade
 *      that blends the artwork into the #050507 page background. No uniform
 *      dark wash — the art stays bright and vibrant.
 *   4. The content row, pinned toward the bottom (the section is a flex
 *      column with mt-auto, so it can grow on short viewports instead of
 *      clipping): the left column (logo, genres, English title, actions,
 *      clamped description) takes ~55–65% of the content width; the info
 *      panel sits right-aligned on desktop and stacks below on mobile.
 *
 * Controls: Play (playback flow arrives later — an honest disabled control
 * with a tooltip), Watch Later (the account-backed watchlist toggle) and
 * Watch Trailer (toggles the background video; clicking again closes it).
 */

/** Hover tooltip for the UI-only Play placeholder (mouse users' only cue). */
function SoonTooltip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-[#0b0b10]/95 px-2.5 py-1 text-[11px] font-semibold text-white/85 opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-opacity duration-200 group-hover:opacity-100 sm:block"
    >
      {children}
    </span>
  );
}

/**
 * Dedicated liquid-glass mute/unmute control for the details-page trailer
 * background. Icon and aria state track the actual audio state; toggling
 * flips the player's audio immediately without restarting playback.
 */
function TrailerMuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={muted}
      aria-label={muted ? "Unmute trailer" : "Mute trailer"}
      title={muted ? "Unmute" : "Mute"}
      className="glass-btn glass-btn--dark flex shrink-0 items-center justify-center rounded-full text-white fixed bottom-6 right-6 z-50 transition-[transform,box-shadow] duration-200 ease-out"
    >
      <span className="relative h-9 w-9 flex items-center justify-center">
        {muted ? (
          <VolumeX className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Volume2 className="h-5 w-5" aria-hidden="true" />
        )}
        {/* Hover/press lift — readable on any backdrop, motion-safe only. */}
      </span>
    </button>
  );
}

export default function AnimeDetailsHero({
  slide,
  info,
  trailer,
}: {
  slide: HeroSlide;
  /** Canonical details payload — drives the right-side information panel. */
  info: Anime;
  /** Resolved trailer source from the (cached) home feed; null → no control. */
  trailer: TrailerSource | null;
}) {
  const [trailerOn, setTrailerOn] = useState(false);
  // Starts unmuted; flips to muted when the user presses the toggle or when
  // the browser refuses unmuted autoplay (visible cue then lets them enable
  // sound explicitly).
  const [muted, setMuted] = useState(false);
  const toggleTrailer = useCallback(() => setTrailerOn((on) => !on), []);
  // A failed/unrefused embed restores the banner: the toggle flips off so
  // the control state always matches what is on screen.
  const handleTrailerFailed = useCallback(() => setTrailerOn(false), []);
  const handleAutoplayBlocked = useCallback(() => setMuted(true), []);
  const toggleMuted = useCallback(() => setMuted((m) => !m), []);

  const genres = getDisplayGenresJoined(info);

  return (
    <section
      className="relative flex min-h-[100svh] w-full flex-col overflow-hidden bg-[#050507]"
      aria-label={`${slide.title} details`}
    >
      {/* Banner background — full-bleed, cover-fitted, client-side fallback
          chain down to the cinematic gradient. */}
      <div className="absolute inset-0 z-0">
        <BackdropImage slide={slide} isActive={true} />
        {/* Left readability scrim behind the content column (the homepage
            hero's recipe, slightly deepened for the longer details column). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.6)_0%,rgba(0,0,0,0.26)_28%,rgba(0,0,0,0)_58%)]"
        />
      </div>

      {/* Trailer background — mounted over the banner while toggled on; the
          video fades in above the banner only once playback is running.
          Unmuted by default when the browser permits it; muted otherwise
          with a visible unmute cue. */}
      {trailerOn && trailer ? (
        <div className="absolute inset-0 z-[2]" aria-hidden="true">
          <TrailerPreview
            source={trailer}
            muted={muted}
            onFailed={handleTrailerFailed}
            onAutoplayBlocked={handleAutoplayBlocked}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.2)_28%,rgba(0,0,0,0)_58%)]" />
        </div>
      ) : null}

      {/* Dedicated mute/unmute control for the trailer background — positioned
          bottom-right over the trailer area at a stacking level above the
          content column so it stays reachable while the trailer plays. Only
          mounted while the trailer is on. */}
      {trailerOn && trailer ? (
        <TrailerMuteToggle muted={muted} onToggle={toggleMuted} />
      ) : null}
      {/* Shared scrims: top vignette under the navbar + bottom fade that
          blends the artwork into the page background (homepage recipe). */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 z-[3] h-24 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.28),rgba(0,0,0,0))]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] h-[30%] bg-[linear-gradient(to_top,#050507_0%,#050507_4%,rgba(5,5,7,0.86)_20%,rgba(5,5,7,0.58)_42%,rgba(5,5,7,0.3)_64%,rgba(5,5,7,0.1)_84%,rgba(5,5,7,0)_100%)]"
      />

      {/* Content row — pushed to the bottom by mt-auto; grows instead of
          clipping when the viewport is short. */}
      <div className="relative z-20 mt-auto w-full px-6 pb-14 pt-40 sm:px-10 sm:pb-16 lg:px-16 lg:pb-20 xl:px-24">
        <div className="hero-content-in flex w-full flex-col gap-7 sm:gap-9 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          {/* Left column — logo, genres, English title, actions, description
              (~60% of the content row on desktop; inner elements self-constrain
              their own widths). */}
          <div className="min-w-0 lg:w-[60%]">
            {slide.logoUrl ? (
              <>
                <SlideLogo
                  src={slide.logoUrl}
                  fallbackSrc={slide.logoFallbackUrl}
                  title={slide.title}
                />
                {genres ? (
                  <p className="type-label mt-3 text-xs text-white/65 uppercase sm:text-sm">
                    {genres}
                  </p>
                ) : null}
                <h1 className="type-display mt-2 text-[30px] sm:text-36px lg:text-42px">
                  {slide.title}
                </h1>
              </>
            ) : (
              <>
                {genres ? (
                  <p className="type-label mt-1 text-xs text-white/65 uppercase sm:text-sm">
                    {genres}
                  </p>
                ) : null}
                <TitleHeading title={slide.title} />
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-7 sm:gap-3">
              {/* Play — opens the watch page for this anime at episode 1. */}
              <Link
                href={`/anime/${slide.anilistId}/watch?ep=1&language=sub`}
                prefetch={true}
              >
                <span className="group relative">
                  <button
                    type="button"
                    aria-label={`Play ${slide.title}`}
                    className="glass-btn glass-btn--bright type-label inline-flex h-12 items-center gap-2.5 rounded-full px-7 text-sm sm:h-[52px] sm:px-9 sm:text-[15px]"
                  >
                    <Play
                      className="h-[18px] w-[18px] fill-current"
                      aria-hidden="true"
                    />
                    Play
                  </button>
                  <SoonTooltip>Watch now</SoonTooltip>
                </span>
              </Link>

              {/* Watch Later — the account-backed watchlist toggle. The
                  canonical details payload enriches the snapshot metadata
                  (seasonYear / format) beyond what the hero slide carries. */}
              <WatchLaterButton
                slide={{
                  anilistId: slide.anilistId,
                  title: slide.title,
                  posterUrl: slide.posterUrl,
                  year: slide.year ?? info.seasonYear,
                  format: info.format,
                }}
                className="h-12 w-12 sm:h-[52px] sm:w-[52px]"
              />

              {/* Watch Trailer — toggles the full-bleed background preview;
                  clicking again (or an embed failure) restores the banner. */}
              {trailer ? (
                <button
                  type="button"
                  onClick={toggleTrailer}
                  aria-pressed={trailerOn}
                  className="glass-btn type-label inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-sm text-white sm:h-[52px] sm:px-8 sm:text-[15px]"
                >
                  {trailerOn ? (
                    <X className="h-[18px] w-[18px]" aria-hidden="true" />
                  ) : (
                    <Video className="h-[18px] w-[18px]" aria-hidden="true" />
                  )}
                  {trailerOn ? "Close Trailer" : "Watch Trailer"}
                </button>
              ) : null}
            </div>

            {slide.description ? (
              <p className="mt-5 line-clamp-3 max-w-[560px] text-sm leading-relaxed text-white/70 drop-shadow-[0_1px_12px_rgba(0,0,0,0.55)] sm:mt-6 sm:line-clamp-4 sm:text-[15px]">
                {slide.description}
              </p>
            ) : null}
          </div>

          {/* Right column — compact liquid-glass information panel. */}
          <DetailsInfoPanel anime={info} title={slide.title} />
        </div>
      </div>
    </section>
  );
}
