"use client";

/**
 * One card on the /watchlist grid — the same Liquid Glass language as
 * PopularCard: fixed aspect-ratio poster behind a rounded, bordered frame,
 * fade-in on load, cinematic fallback gradient when a poster is missing or
 * fails, and the shared action row (Play / Watch Later / Info).
 *
 * The backend stores ONLY the AniList ID + saved timestamp, so each entry
 * that arrives without display metadata hydrates ONCE from the existing
 * `/details/:id` endpoint (README §watchlist's "frontend hydrates" rule).
 * Hydration failures stay silent: the card keeps an honest "Untitled" +
 * gradient fallback and is never a network-retry loop. The bookmark button
 * keeps its exact shared behavior and visuals: pressed (check) means saved,
 * clicking removes — the removal is optimistic and reverts with a toast
 * when persistence fails.
 */

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Info, Play } from "lucide-react";
import {
  getAnimeArtwork,
  getDisplayFormat,
  getDisplayTitle,
  getDisplayYear,
  getFallbackGradient,
  isOptimizableImageUrl,
  isValidAnimeEntry,
} from "@/lib/anime";
import WatchLaterButton from "@/components/anime/WatchLaterButton";
import { describeFormat } from "@/components/anime/PopularCard";
import type { WatchlistEntry } from "@/lib/watchlist/types";
import type { Anime } from "@/lib/types";

/**
 * Client-safe details hydration through the same-origin proxy (the server
 * pipeline in `lib/api.ts` is `server-only` by design — the proxy injects the
 * API key server-side and the browser never sees it). Bounded + one-shot:
 * a failed hydration leaves the honest fallbacks; the "advance exactly once,
 * never retry" rule applies.
 */
async function fetchDetailsForCard(anilistId: number): Promise<Anime | null> {
  try {
    const response = await fetch(`/api/details/${anilistId}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isValidAnimeEntry(payload) ? payload : null;
  } catch {
    return null;
  }
}

/** Mirrors the watchlist grid's single-column widths for next/image. */
const POSTER_SIZES =
  "(min-width: 1536px) 292px, (min-width: 1280px) 272px, (min-width: 768px) 232px, (min-width: 500px) 42vw, 60vw";

/** Display metadata resolved from a snapshot and/or hydration. */
interface ResolvedMeta {
  title: string;
  posterUrl: string | null;
  year: number | null;
  format: string | null;
}

/** Resolve display fields an entry carries inline (session-saved entry). */
function resolveInline(entry: WatchlistEntry): ResolvedMeta {
  return {
    title: entry.title ?? "Untitled",
    posterUrl: entry.posterUrl ?? null,
    year: entry.year ?? null,
    format: entry.format ?? null,
  };
}

/**
 * Merge an inline snapshot (authoritative once present) with a details
 * payload (fills identities saved on another device; null payload → honest
 * "Untitled" fallbacks, never a retry loop).
 */
function resolveWithDetails(entry: WatchlistEntry, anime: Anime | null): ResolvedMeta {
  const poster =
    entry.posterUrl !== undefined
      ? entry.posterUrl
      : anime
        ? getAnimeArtwork(anime).poster
        : null;
  return {
    title: entry.title ?? (anime ? getDisplayTitle(anime) : "Untitled"),
    posterUrl: poster ?? null,
    year: entry.year !== undefined ? entry.year : anime ? getDisplayYear(anime) : null,
    format: entry.format !== undefined ? entry.format : anime ? getDisplayFormat(anime) : null,
  };
}

/** Compact label for the entry's saved date. */
function describeAddedAt(addedAt: string): string | null {
  if (!addedAt) return null;
  const date = new Date(addedAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}

export default function WatchlistCard({ entry }: { entry: WatchlistEntry }) {
  // Snapshot metadata first; entries that carry none (backend list) hydrate.
  const [hydrated, setHydrated] = useState<ResolvedMeta | null>(null);
  const hydrateStartedRef = useRef(false);

  useEffect(() => {
    if (entry.title !== undefined || hydrateStartedRef.current) return;
    hydrateStartedRef.current = true;
    void (async () => {
      const details = await fetchDetailsForCard(entry.animeId);
      setHydrated(
        resolveWithDetails(entry, details ?? null),
      );
    })();
    // The entry's snapshot fields only change with its identity (keyed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.animeId]);

  const meta = resolveInline(entry);
  const shown: ResolvedMeta =
    entry.title !== undefined
      ? meta
      : (hydrated ?? { title: "Untitled", posterUrl: null, year: null, format: null });

  // Single candidate chain (snapshot poster → cinematic gradient), mirroring
  // PopularCard's "advance exactly once, never retry" fallback rule.
  const [failedCount, setFailedCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const candidates =
    shown.posterUrl && isOptimizableImageUrl(shown.posterUrl) ? [shown.posterUrl] : [];
  const current = failedCount < candidates.length ? candidates[failedCount] : null;

  const detailsUrl = `/anime/${entry.animeId}`;
  const watchUrl = `/anime/${entry.animeId}/watch?ep=1&language=sub`;
  const savedLabel = describeAddedAt(entry.addedAt);
  const metaParts = [
    describeFormat(shown.format),
    shown.year !== null ? String(shown.year) : null,
    savedLabel !== null ? `Saved ${savedLabel}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <li className="group/wl relative z-0 w-full focus-within:z-30 hover:z-30">
      <div className="relative transition-transform duration-300 ease-out group-focus-within/wl:-translate-y-1.5 group-hover/wl:-translate-y-1.5">
        <Link
          href={detailsUrl}
          aria-label={shown.title}
          prefetch={true}
          className="relative block aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-[border-color,box-shadow] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 group-hover/wl:border-white/25 group-hover/wl:shadow-[0_20px_45px_rgba(0,0,0,0.65)] group-focus-within/wl:border-white/25 group-focus-within/wl:shadow-[0_20px_45px_rgba(0,0,0,0.65)]"
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
              className={`object-cover object-center transition-opacity duration-500 ease-out ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background: getFallbackGradient(`${entry.animeId}:${shown.title}`),
              }}
            />
          )}
        </Link>

        <p className="type-label mt-3 truncate text-[16px] text-white">{shown.title}</p>
        {metaParts.length > 0 ? (
          <p className="mt-0.5 truncate text-[11px] font-medium text-white/55">
            {metaParts.join(" · ")}
          </p>
        ) : null}

        <div className="mt-2.5 flex items-center gap-2">
          <Link
            href={watchUrl}
            aria-label={`Play ${shown.title}`}
            title="Play"
            className="glass-btn glass-btn--bright flex h-11 w-11 items-center justify-center rounded-full"
          >
            <Play className="h-5 w-5 fill-current" aria-hidden="true" />
          </Link>
          {/* Pressed (check) = saved — clicking here removes the title from
              the account watchlist (optimistic, reverts on failure). The
              hydrated metadata rides along as the save's display snapshot. */}
          <WatchLaterButton
            slide={{
              anilistId: entry.animeId,
              title: shown.title,
              posterUrl: shown.posterUrl,
              year: shown.year,
              format: shown.format,
            }}
            className="h-11 w-11"
          />
          <Link
            href={detailsUrl}
            aria-label={`More information about ${shown.title}`}
            title="More information"
            className="glass-btn flex h-11 w-11 items-center justify-center rounded-full text-white"
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}
