"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Film } from "lucide-react";
import type { Anime, SearchCard } from "@/lib/types";

/**
 * Search result row — shared by the navbar search popup and the dedicated
 * /search page (identical reference layout: poster left, title, content type
 * below, expand/collapse chevron right; comfortable spacing and a subtle
 * hover background).
 *
 * Expansion reveals ONLY metadata the backend actually returns: release
 * year/season, format/type, episodes, status from the search card itself, and
 * the description/awareness score lazily from `/api/details/:id` (AniList ID —
 * the canonical identity; no MAL/TMDB ID is ever misused). The details fetch
 * is: one attempt per row, no retry, aborted when the row collapses or
 * unmounts, and cached in module state for the session so re-expanding never
 * refetches.
 */

/** AniList format → label contract (uppercase, like the reference). */
const FORMAT_LABELS: Record<string, string> = {
  TV: "TV show",
  TV_SHORT: "TV short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
};

export function formatTypeLabel(card: SearchCard): string {
  if (card.format && FORMAT_LABELS[card.format]) return FORMAT_LABELS[card.format];
  if (card.format) return card.format.toUpperCase();
  // Card type is always "ANIME" for the current backend namespace.
  return (card.type ?? "ANIME").toUpperCase();
}

/** AniList status → human label (only values the search card actually carries). */
const STATUS_LABELS: Record<string, string> = {
  FINISHED: "Completed",
  RELEASING: "Airing",
  NOT_YET_RELEASED: "Upcoming",
  CANCELLED: "Cancelled",
  HIATUS: "On hiatus",
};

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  // Unknown statuses stay verbatim (never invented labels).
  return STATUS_LABELS[status] ?? status.toLowerCase();
}

/** Details enrichment cached per AniList ID for the page session. */
interface DetailsEnrichment {
  description: string | null;
  averageScore: number | null;
}

const detailsCache = new Map<number, DetailsEnrichment>();

function stripHtmlTags(raw: string): string | null {
  const text = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

export interface SearchResultRowProps {
  card: SearchCard;
  /** Keyboard-active highlight from the popup's arrow navigation. */
  highlighted?: boolean;
  /** Roving focus registration for the popup's arrow navigation. */
  onFocusAnnounce?: (index: number) => void;
  rowFocusRef?: (node: HTMLAnchorElement | null) => void;
  /** Closes the popup UI when a row navigates (popup passes onClose). */
  onNavigate?: () => void;
  /** Stable row index for aria/highlight bookkeeping. */
  index?: number;
}

export default function SearchResultRow({
  card,
  highlighted = false,
  onFocusAnnounce,
  rowFocusRef,
  onNavigate,
  index = 0,
}: SearchResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [detailsState, setDetailsState] = useState<
    "idle" | "loading" | "failed"
  >("idle");
  const [enrichment, setEnrichment] = useState<DetailsEnrichment | null>(
    () => detailsCache.get(card.anilistId) ?? null,
  );

  const abortRef = useRef<AbortController | null>(null);
  const cachedAnilistId = card.anilistId;

  useEffect(() => {
    return () => {
      // Unmount stale fetches (search row replaced mid-flight).
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const loadDetails = useCallback(() => {
    if (abortRef.current) return; // in flight this row
    const cached = detailsCache.get(cachedAnilistId);
    if (cached) {
      setEnrichment(cached);
      setDetailsState("idle");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setDetailsState("loading");
    fetch(`/api/details/${cachedAnilistId}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("status"))))
      .then((payload: Anime) => {
        const raw = typeof payload?.description === "string" ? payload.description : null;
        const entry: DetailsEnrichment = {
          description: raw ? stripHtmlTags(raw) : null,
          averageScore:
            typeof payload?.averageScore === "number" ? payload.averageScore : null,
        };
        detailsCache.set(cachedAnilistId, entry);
        setEnrichment(entry);
        setDetailsState("idle");
      })
      .catch(() => {
        // One bounded attempt; no automatic retry. The row's own card data
        // (year/format/episodes/status) still renders in the expanded panel.
        if (controller.signal.aborted) return;
        setDetailsState("failed");
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
  }, [cachedAnilistId]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) loadDetails();
      else {
        abortRef.current?.abort();
        abortRef.current = null;
      }
      return next;
    });
  }, [loadDetails]);

  const titleText =
    card.title ?? card.titleEnglish ?? card.titleRomaji ?? card.titleNative ?? "Untitled";
  const meta = formatTypeLabel(card);
  const detailHref = `/anime/${card.anilistId}`;

  return (
    <li className="relative">
      <div
        className={`search-row ${highlighted ? "search-row--active" : ""} ${
          expanded ? "search-row--expanded" : ""
        }`}
      >
        <Link
          ref={rowFocusRef}
          href={detailHref}
          onFocus={() => onFocusAnnounce?.(index)}
          onClick={onNavigate}
          className="group flex min-w-0 flex-1 items-center gap-3.5 rounded-xl sm:gap-4"
          aria-label={`Open ${titleText} details`}
        >
          {/* Poster — 2:3 like the reference; honest fallback tile when the
              backend card has no cover image. */}
          {card.images?.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.images.poster}
              alt=""
              loading="lazy"
              className="search-row-poster"
            />
          ) : (
            <span className="search-row-poster search-row-poster--empty flex items-center justify-center">
              <Film className="h-5 w-5 text-white/20" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="search-row-title">{titleText}</span>
            <span className="search-row-meta">{meta}</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={`search-row-panel-${index}`}
          aria-label={expanded ? "Collapse details" : `Expand ${titleText} details`}
          className={`search-chev ${expanded ? "search-chev--open" : ""}`}
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </div>

      {/* Expand panel — metadata only the backend returns; no invention. */}
      <div
        id={`search-row-panel-${index}`}
        hidden={!expanded}
        className="search-row-panel"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/55">
          {card.seasonYear ? <span>{card.seasonYear}</span> : null}
          {card.season && card.seasonYear ? <span aria-hidden="true">·</span> : null}
          {card.season ? (
            <span className="capitalize">{card.season.toLowerCase()}</span>
          ) : null}
          {card.episodes ? <span>{card.episodes} eps</span> : null}
          {statusLabel(card.status) ? <span>{statusLabel(card.status)}</span> : null}
          {enrichment?.averageScore ? (
            <span className="text-white/75">{(enrichment.averageScore / 10).toFixed(1)}</span>
          ) : null}
        </div>
        {expanded ? (
          detailsState === "loading" ? (
            <p className="search-row-desc search-row-desc--loading">
              Loading description…
            </p>
          ) : enrichment?.description ? (
            <p className="search-row-desc">{enrichment.description}</p>
          ) : (
            detailsState === "failed" && (
              <p className="search-row-desc text-white/35">
                Description unavailable right now.
              </p>
            )
          )
        ) : null}
        <Link
          href={detailHref}
          onClick={onNavigate}
          className="search-row-open type-label"
        >
          View details →
        </Link>
      </div>
    </li>
  );
}
