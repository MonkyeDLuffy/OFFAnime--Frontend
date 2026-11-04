"use client";

import Image from "next/image";
import Link from "next/link";
import { Play, X } from "lucide-react";
import { useCallback } from "react";
import { useToast } from "@/components/auth/ToastProvider";
import { getFallbackGradient, isOptimizableImageUrl } from "@/lib/anime";
import type { ContinueWatchingEntry } from "@/lib/continue-watching/types";

/** Mirrors the card widths in PopularCard/TopTenCard for next/image. */
const CARD_SIZES =
  "(min-width: 1536px) 300px, (min-width: 1280px) 290px, (min-width: 1024px) 280px, (min-width: 768px) 260px, (min-width: 640px) 240px, 58vw";

interface ContinueWatchingCardProps {
  entry: ContinueWatchingEntry;
  /** Remove this entry (optimistic + rollback handled by the caller). */
  onRemove: (anilistId: number) => Promise<boolean>;
}

/** Watch URL: restores the correct episode and preserves the SUB/DUB
 * preference. The app defaults to "sub" when no language is in the URL. */
function watchUrl(entry: ContinueWatchingEntry): string {
  return `/anime/${entry.anilistId}/watch?ep=${entry.episode}&language=sub`;
}

/** Episode line: "Episode 12 · The Final Battle" when an episode title is
 * available, otherwise just "Episode 12". Never fabricates a title. */
function episodeLine(entry: ContinueWatchingEntry): string {
  if (entry.episodeTitle) return `Episode ${entry.episode} · ${entry.episodeTitle}`;
  return `Episode ${entry.episode}`;
}

export default function ContinueWatchingCard({
  entry,
  onRemove,
}: ContinueWatchingCardProps) {
  const { toast } = useToast();

  // While this entry's anime + episode metadata is still being fetched
  // (per-entry hydration), render a proper in-card skeleton — never an
  // empty-looking placeholder presented as a finished card.
  const hydrating = entry.metaStatus === "loading";

  const gradient = getFallbackGradient(String(entry.anilistId));
  const hasProgress = entry.progress != null && entry.progress > 0;

  // Image fallback priority: episode thumbnail → anime banner/poster → gradient.
  // Each step is only used when it resolves to an optimizable image URL so a
  // non-optimizable episode thumbnail never blocks the anime poster fallback.
  const resolvedImage =
    isOptimizableImageUrl(entry.episodeThumbnail ?? null)
      ? entry.episodeThumbnail ?? null
      : isOptimizableImageUrl(entry.posterUrl ?? null)
        ? entry.posterUrl ?? null
        : null;
  const hasImage = Boolean(resolvedImage);

  const handleRemove = useCallback(
    async (event: React.MouseEvent) => {
      // A remove click must not also navigate to the watch page.
      event.stopPropagation();
      const ok = await onRemove(entry.anilistId);
      if (ok) {
        toast({
          tone: "info",
          message: "Removed from continue watching.",
        });
      } else {
        toast({
          tone: "error",
          message: "Couldn't remove that title. Try again shortly.",
        });
      }
    },
    [onRemove, entry.anilistId, toast],
  );

  return (
    <div className="cw-card relative shrink-0 w-[58vw] max-w-[240px] sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]">
      <Link
        href={watchUrl(entry)}
        className="cw-link"
        aria-label={`Continue watching ${entry.title ?? "this title"}, episode ${entry.episode}`}
        onClick={(event) => {
          // Keyboard activation (detail 0) navigates as always.
          if (event.detail === 0) return;
        }}
      >
        {/* Artwork frame: episode thumbnail → anime banner/poster → fallback gradient.
            The frame itself stays static on hover (only shadows/edge respond); the
            artwork zooms inside it — see .cw-* interactions in globals.css. */}
        <div className="cw-frame">
          <div className="cw-media">
            {hydrating ? (
              <>
                {/* Metadata in flight: same gradient base, with a shimmer so
                    the card never reads as a finished empty placeholder. */}
                <span
                  className="absolute inset-0"
                  style={{ background: gradient }}
                  aria-hidden="true"
                />
                <div
                  className="absolute inset-0 bg-white/[0.06] animate-pulse"
                  aria-hidden="true"
                />
              </>
            ) : hasImage ? (
              <Image
                fill
                src={resolvedImage!}
                alt=""
                sizes={CARD_SIZES}
                loading="eager"
              />
            ) : (
              <span
                className="absolute inset-0"
                style={{ background: gradient }}
                aria-hidden="true"
              />
            )}
          </div>
          {/* Cinematic hover overlay: bottom-weighted gradient + the centered
              continue chip (glass pill keeps its contrast on any artwork). */}
          <div className="cw-cine" aria-hidden="true">
            <span className="cw-chip">
              <Play className="h-4 w-4" aria-hidden="true" />
              Continue
            </span>
          </div>
          {/* Episode badge — liquid glass pill, anchored top-left of the image. */}
          <span className="cw-ep-badge" aria-hidden="true">
            <span className="cw-ep-tag">EP</span>
            <span>{entry.episode}</span>
          </span>
          {/* Progress bar, only when the backend actually reports progress.
              z-20 keeps it crisp above the cinematic overlay. */}
          {hasProgress && entry.progress != null ? (
            <div className="absolute bottom-0 left-0 right-0 z-20 h-1.5 bg-white/[0.12]">
              <div
                className="h-full bg-white"
                style={{
                  width: `${Math.min(100, Math.max(0, entry.progress))}%`,
                }}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-col gap-1">
          {hydrating ? (
            // Skeleton text bars while the card's own metadata is in flight.
            <div className="flex flex-col gap-1.5" aria-hidden="true">
              <div className="h-4 w-3/4 rounded bg-white/[0.08] animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
            </div>
          ) : (
            <>
              {/* Anime title — body font (Inter), never the literal "Untitled". */}
              {entry.title ? (
                <h3
                  className="cw-title type-label truncate text-[15px] sm:text-[17px] font-medium"
                  title={entry.title}
                >
                  {entry.title}
                </h3>
              ) : null}
              {entry.episodeTitle || entry.title ? (
                <p className="cw-sub type-label truncate text-[11px]">
                  {episodeLine(entry)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Link>

      {/* Remove action, revealed on card hover/focus and revealed permanently
          on touch devices. It sits OUTSIDE the Link and stops propagation, so
          clicking it never navigates to the watch page. */}
      <button
        type="button"
        onClick={handleRemove}
        aria-label={`Remove ${entry.title ?? "this title"} from continue watching`}
        className="cw-remove"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
