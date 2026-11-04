"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Info, Play, Volume2, VolumeX } from "lucide-react";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import type { PopularEntry, TrailerSource } from "@/lib/types";
import TrailerPreview from "./TrailerPreview";
import WatchLaterButton from "./WatchLaterButton";

/**
 * The Netflix-style expanded preview anchored to a hovered carousel card,
 * portaled to `<body>` so the carousel's overflow clip can never cut it off.
 *
 * - Geometry: fixed positioning beside the poster — to its right (with a
 *   small breathing gap), flipping to its left when there is no room on the
 *   right, vertically centered on the card and clamped so the popup always
 *   stays inside the viewport (beside edge cards it may overlap the poster
 *   rather than overflow). Measured once after mount (the info section's
 *   height depends on its content) and re-anchored on resize; position is
 *   never animated — only transformed.
 * - Entrance: a 280ms transform-only animation — subtle horizontal
 *   translate out of the poster's edge (direction flips with the placement
 *   side via `--trailer-popup-shift-x`), a restrained scale, and opacity.
 *   No width/height/layout properties are animated. Dismissal mirrors it:
 *   `closing` swaps the animation for a matching exit (opacity, translate,
 *   scale-down) while the slot has already been released — the players are
 *   gone, the shell just fades out and then unmounts.
 * - Video area: the card's poster backs the 16:9 frame (`object-cover`,
 *   never stretched) and stays visible while the player mounts (briefly
 *   deferred so the shell paints and the entrance animation starts first);
 *   the trailer fades in over it once playback is actually running. A
 *   missing or failed trailer keeps the poster visible.
 * - Audio: playback starts muted (autoplay-safe); the liquid glass mute
 *   toggle flips audio through the player API without stopping or reloading
 *   it, and the choice persists for as long as this preview stays open.
 * - Pointer flow: entering the popup cancels a pending close, leaving
 *   schedules one (the hook owns the timers), so the pointer can travel
 *   between poster and popup without the preview flickering off. Closing
 *   unmounts the popup, which destroys the player and stops playback.
 */

/** Popup width — CSS min() keeps it inside narrow viewports as well. */
const POPUP_WIDTH = "min(400px, calc(100vw - 24px))";
/** Hard viewport margin the popup never crosses. */
const VIEWPORT_MARGIN = 12;
/** Breathing gap between the poster's edge and the popup. */
const ANCHOR_GAP = 10;
/** Entrance travel distance (px) out of the poster's edge. */
const ENTRANCE_SHIFT_PX = 18;
/** Delays the player mount so the shell paints and the entrance animation
    starts before any iframe setup work lands on the main thread. */
const PLAYER_MOUNT_DELAY_MS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface Placement {
  left: number;
  top: number;
  side: "right" | "left";
}

/**
 * Places the popup beside the poster: right side first, left side when the
 * right has no room, and — when neither side fits the whole popup — whichever
 * side has more room, clamped so the popup never leaves the viewport (it may
 * overlap the poster, but it is never clipped).
 */
function computePlacement(
  rect: DOMRect,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): Placement {
  const top = clamp(
    rect.top + rect.height / 2 - height / 2,
    VIEWPORT_MARGIN,
    viewportHeight - VIEWPORT_MARGIN - height,
  );
  const rightLeft = rect.right + ANCHOR_GAP;
  const leftLeft = rect.left - ANCHOR_GAP - width;
  const fitsRight = rightLeft + width <= viewportWidth - VIEWPORT_MARGIN;
  const fitsLeft = leftLeft >= VIEWPORT_MARGIN;

  if (fitsRight) return { left: rightLeft, top, side: "right" };
  if (fitsLeft) return { left: leftLeft, top, side: "left" };

  if (
    viewportWidth - VIEWPORT_MARGIN - rightLeft >=
    leftLeft - VIEWPORT_MARGIN
  ) {
    return {
      left: Math.min(rightLeft, viewportWidth - VIEWPORT_MARGIN - width),
      top,
      side: "right",
    };
  }
  return { left: Math.max(leftLeft, VIEWPORT_MARGIN), top, side: "left" };
}

export default function TrailerPopup({
  entry,
  metaLabel,
  anchorRef,
  popupRef,
  source,
  closing = false,
  onPointerEnter,
  onPointerLeave,
  onFailed,
}: {
  entry: PopularEntry;
  /** Prejoined format · year · episodes line (null → hidden). */
  metaLabel: string | null;
  anchorRef: RefObject<HTMLLIElement | null>;
  popupRef: RefObject<HTMLDivElement | null>;
  /** Non-null exactly while the player should be mounted; null → poster. */
  source: TrailerSource | null;
  /** True while the shell plays its exit animation (players already gone). */
  closing?: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFailed: () => void;
}) {
  // Every open mounts a fresh popup, so audio always starts muted and the
  // choice is preserved for as long as this preview remains open.
  const [muted, setMuted] = useState(true);
  const [posterFailed, setPosterFailed] = useState(false);
  const [playerMounted, setPlayerMounted] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const toggleMuted = useCallback(() => setMuted((value) => !value), []);

  // Mount the player just after the shell — the poster and the entrance
  // animation are already running by then, so iframe setup never blocks the
  // transition. The timer is cancelled on close (player never mounts).
  useEffect(() => {
    if (source === null) return;
    const timer = window.setTimeout(
      () => setPlayerMounted(true),
      PLAYER_MOUNT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [source]);

  // Anchor beside the card: right of it (or left, when there is no room),
  // vertically centered, clamped inside the viewport. Runs in a layout
  // effect so the first paint already sits at the final position and the
  // entrance animation plays from there — position itself is never animated.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    const anchor = anchorRef.current;
    if (!popup || !anchor) return;
    const compute = () => {
      setPlacement(
        computePlacement(
          anchor.getBoundingClientRect(),
          popup.offsetWidth,
          popup.offsetHeight,
          window.innerWidth,
          window.innerHeight,
        ),
      );
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [anchorRef, popupRef]);

  const posterUrl = isOptimizableImageUrl(entry.posterUrl)
    ? entry.posterUrl
    : null;
  const showPoster = posterUrl !== null && !posterFailed;
  const onLeft = placement?.side === "left";

  const popupStyle: CSSProperties = {
    position: "fixed",
    left: placement?.left ?? 0,
    top: placement?.top ?? 0,
    width: POPUP_WIDTH,
    // Grow out of the poster: origin and travel direction flip with the side.
    transformOrigin: onLeft ? "right center" : "left center",
    ["--trailer-popup-shift-x" as string]: `${
      onLeft ? ENTRANCE_SHIFT_PX : -ENTRANCE_SHIFT_PX
    }px`,
  };

  return createPortal(
    <div
      ref={popupRef}
      aria-label={`${entry.title} preview`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={`${closing ? "trailer-popup-out" : "trailer-popup-in"} z-50 overflow-hidden rounded-xl border border-white/10 bg-[#0b0b11] shadow-[0_30px_80px_rgba(0,0,0,0.78)] ${
        placement ? "opacity-100" : "invisible"
      }`}
      style={popupStyle}
    >
      {/* 16:9 video area — the poster backs the frame so playback startup,
          pauses and failures all keep a fully painted, cover-fitted image. */}
      <div className="relative aspect-video w-full overflow-hidden bg-[#0d0d13]">
        {showPoster ? (
          <Image
            key={posterUrl}
            src={posterUrl}
            alt=""
            fill
            sizes="(min-width: 424px) 400px, calc(100vw - 24px)"
            quality={90}
            draggable={false}
            onError={() => setPosterFailed(true)}
            className="object-cover object-[50%_35%]"
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
        {source && playerMounted ? (
          <TrailerPreview
            source={source}
            muted={muted}
            onFailed={onFailed}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-14 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
        />
        {source ? (
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={!muted}
            aria-label={
              muted
                ? `Unmute ${entry.title} trailer`
                : `Mute ${entry.title} trailer`
            }
            title={muted ? "Unmute" : "Mute"}
            className="glass-btn glass-btn--dark absolute bottom-2.5 right-2.5 z-[3] flex h-10 w-10 items-center justify-center rounded-full text-white"
          >
            {muted ? (
              <VolumeX className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>

      {/* Info area — the same actions as the card's hover panel. */}
      <div className="px-4 pb-4 pt-3">
        <p className="type-label truncate text-[17px] text-white">
          {entry.title}
        </p>
        {metaLabel ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
            {metaLabel}
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <Link
            href={`/anime/${entry.anilistId}`}
            prefetch={true}
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
            href={`/anime/${entry.anilistId}`}
            prefetch={true}
            aria-label={`More information about ${entry.title}`}
            title="More information"
            className="glass-btn flex h-11 w-11 items-center justify-center rounded-full text-white"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
