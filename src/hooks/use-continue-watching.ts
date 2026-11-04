"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { hydrateAnimeMetadata } from "@/lib/continue-watching/metadata-client";
import { getDisplayTitle } from "@/lib/anime";
import type { Anime } from "@/lib/types";
import {
  listContinueWatching,
  upsertContinueWatching,
  removeContinueWatching,
} from "@/lib/continue-watching/api-client";
import type {
  ContinueWatchingEntry,
  ContinueWatchingStatus,
} from "@/lib/continue-watching/types";

interface AnimeHydration {
  anime: Anime | null;
  episodes: { globalEpisodeNumber: number; title: string | null; image: string | null }[];
}
const hydrationCache = new Map<number, Promise<AnimeHydration | null>>();

function hydrateAnime(anilistId: number): Promise<AnimeHydration | null> {
  let promise = hydrationCache.get(anilistId);
  if (promise) return promise;
  promise = hydrateAnimeMetadata(anilistId);
  hydrationCache.set(anilistId, promise);
  // Never cache a REJECTED hydration: a transport failure must not poison the
  // cache for the rest of the session. Dropping it lets a later mount retry
  // that anime while in-flight resolution still dedupes every concurrent
  // caller. Consumers always catch on their own.
  promise.catch(() => {
    if (hydrationCache.get(anilistId) === promise) {
      hydrationCache.delete(anilistId);
    }
  });
  return promise;
}


/** Optional-field normalizer: backend `null`/`undefined` becomes
 * `undefined` so the optional string display fields stay assignable. */
function opt(value: string | null | undefined): string | undefined {
  return value || undefined;
}

/** Image normalizer: backend `null`/`undefined` stays `null` (image fields
 * are nullable). */
function optImg(value: string | null | undefined): string | null {
  return value ?? null;
}

/** Hook: fetch the authenticated user's continue-watching history, hydrate
 * each entry with anime + episode metadata, and expose debounced save/remove.
 *
 * The backend is the source of truth. Nothing is written to localStorage.
 * While `status === "loading"` (auth restoration OR list fetch in flight) the
 * caller renders a skeleton and never clears existing state. */
export function useContinueWatching() {
  const { status, user } = useAuth();

  const [cwStatus, setCwStatus] = useState<ContinueWatchingStatus>("idle");
  const [items, setItems] = useState<ContinueWatchingEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  // In-flight progress updates keyed by `${anilistId}:${episode}` — a newer
  // save for the same entry replaces any pending older save (dedupe + ignore
  // stale responses).
  const pendingRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const clearTimers = useCallback(() => {
    debounceTimersRef.current.forEach((t) => clearTimeout(t));
    debounceTimersRef.current.clear();
  }, []);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  // --- Auth-gated list fetch ------------------------------------------------
  // Wait until auth restoration is complete (status !== "loading") before
  // touching the list endpoint. Guests and unauthenticated users see nothing.
  useEffect(() => {
    if (status === "loading") {
      setCwStatus("idle");
      return;
    }
    if (status !== "authenticated" || !user) {
      setCwStatus("idle");
      setItems([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setCwStatus("loading");
    (async () => {
      const result = await listContinueWatching();
      if (cancelled) return;
      if (result.kind === "items") {
        // Fresh entries start in the "hydrating" state: the card UI shows a
        // proper per-card skeleton (not an empty-looking placeholder) until
        // its own metadata resolves or fails.
        setItems(
          result.items.map((entry) => ({
            ...entry,
            metaStatus: "loading" as const,
          })),
        );
        setCwStatus("ready");
        setError(null);
      } else {
        setCwStatus(
          result.reason === "session-expired"
            ? "expired"
            : result.reason === "unavailable"
              ? "unavailable"
              : "error",
        );
        setError(
          result.reason === "session-expired"
            ? "Your session has expired. Please sign in again."
            : result.reason === "unavailable"
              ? "The continue-watching service is unavailable right now."
              : "Could not load your continue-watching list.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user]);

  // --- Metadata hydration ---------------------------------------------------
  // Every entry hydrates INDEPENDENTLY: its own anilistId -> its own
  // /details + /episodes calls -> its own episode record (matched by
  // globalEpisodeNumber) -> its own thumbnail. Results accumulate in a
  // per-instance ref keyed by anilistId and are applied with a FUNCTIONAL
  // state update, so concurrent completions compose correctly and concurrent
  // operations (save/remove) are preserved. No result can ever overwrite
  // another anime's data.
  //
  // ROOT-CAUSE FIX (first-visit metadata loss): this effect used to re-run
  // whenever `items` changed, and its CLEANUP aborted every still in-flight
  // hydration controller. The completing hydration re-ran the effect, whose
  // cleanup aborted the OTHER in-flight fetches — those results were silently
  // discarded and never retried because the ids were marked as "started"
  // up-front. The second homepage visit then "worked" only because the
  // module-level promise cache still held the resolved promises (hydration
  // started but never reached state). Now the effect re-runs on identity
  // changes only, there is nothing to abort (in-flight work shared through
  // the module cache keeps running), and any later mount re-attaches and
  // applies instantly.
  const hydrationRef = useRef<
    Map<number, {
      status: "ready" | "failed";
      title: string | undefined;
      posterUrl: string | null;
      year: number | null;
      format: string | null;
      episodeTitle: string | undefined;
      episodeThumbnail: string | null;
    }>
  >(new Map());
  // Per-instance subscription guard: marked SYNCHRONOUSLY when a hydration's
  // `.then` is attached, so re-runs of this effect (triggered by setItems)
  // never re-attach — the mechanism that previously caused the freeze loop.
  // It no longer gates NETWORK calls: the module promise cache dedupes those,
  // and nothing here ever aborts one.
  const attachedRef = useRef(new Set<number>());

  /** Apply every record in `hydrationRef` onto the current list with one
   * functional update. Idempotent and keyed per anilistId. */
  const applyHydration = useCallback(() => {
    setItems((prev) =>
      prev.map((entry) => {
        const record = hydrationRef.current.get(entry.anilistId);
        if (!record) return entry;
        return {
          ...entry,
          title: record.title ?? entry.title,
          posterUrl: record.posterUrl ?? entry.posterUrl,
          year: record.year ?? entry.year,
          format: record.format ?? entry.format,
          episodeTitle: record.episodeTitle ?? entry.episodeTitle,
          episodeThumbnail: record.episodeThumbnail ?? entry.episodeThumbnail,
          metaStatus: record.status,
        };
      }),
    );
  }, []);

  useEffect(() => {
    // Entries whose hydration THIS instance has not subscribed to yet. The
    // module-level promise cache dedupes/deduplicates network calls across
    // hooks and mounts; this filter only controls which ids get a `.then`
    // ATTACHED for applying their result into this instance's state.
    const pending = items.filter(
      (entry) => !attachedRef.current.has(entry.anilistId),
    );
    if (pending.length === 0) return;
    pending.forEach((entry) => attachedRef.current.add(entry.anilistId));

    // Bounded concurrency: several anime hydrate simultaneously without
    // overwhelming the backend. List order == carousel order, so the entries
    // the user actually sees first are hydrated first.
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const entry = pending[cursor];
        cursor += 1;
        try {
          const hydration = await hydrateAnime(entry.anilistId);
          // Episode lookup is per-entry: the card's saved episode must match
          // the episode's globalEpisodeNumber exactly.
          const targetEpisode = hydration?.episodes.find(
            (episode) => episode.globalEpisodeNumber === entry.episode,
          );
          hydrationRef.current.set(entry.anilistId, {
            status: "ready",
            title: hydration?.anime
              ? getDisplayTitle(hydration.anime)
              : undefined,
            posterUrl:
              hydration?.anime?.images?.banner ??
              hydration?.anime?.images?.poster ??
              null,
            year: hydration?.anime?.seasonYear ?? null,
            format: hydration?.anime?.format ?? null,
            episodeTitle: opt(targetEpisode?.title),
            episodeThumbnail: optImg(targetEpisode?.image),
          });
        } catch {
          // Transport failure (network/timeout): mark the entry honestly as
          // failed. The module cache drops the rejected promise (see
          // hydrateAnime), so a later mount retries; this mount keeps the
          // recorded failure and renders the entry's fallback card.
          hydrationRef.current.set(entry.anilistId, {
            status: "failed",
            title: undefined,
            posterUrl: null,
            year: null,
            format: null,
            episodeTitle: undefined,
            episodeThumbnail: null,
          });
        }
        // Functional update: composes with concurrent saves/removes; the
        // record map keys by anilistId so one completion can never overwrite
        // another anime's metadata.
        applyHydration();
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, pending.length); i += 1) {
      void worker();
    }
    // NO abort on cleanup: effect re-runs happen when the list identity
    // changes (save/remove). In-flight hydrations are shared through the
    // module promise cache; re-attaching via a later run (or a later mount)
    // is exactly how results reach state. React discards setState after
    // unmount, so a stale apply is a harmless no-op.
  }, [items, applyHydration]);

  // --- Progress save (debounced + deduped) ----------------------------------
  const saveProgress = useCallback(
    (anilistId: number, episode: number, progress?: number) => {
      const key = `${anilistId}:${episode}`;
      const existing = pendingRef.current.get(key);
      if (existing) {
        // A newer save for the same entry is already in flight; the older
        // pending value is superseded (stale responses are ignored).
        return;
      }

      const run = async () => {
        const result = await upsertContinueWatching({
          anilistId,
          episode,
          ...(progress !== undefined ? { progress } : {}),
        });
        pendingRef.current.delete(key);
        if (!result.ok) return; // leave local state as-is; user can retry
        setItems((prev) =>
          prev.map((e) =>
            e.anilistId === anilistId && e.episode === episode
              ? { ...e, updatedAt: result.updatedAt ?? e.updatedAt }
              : e,
          ),
        );
      };

      // Fire once immediately for responsiveness, deduped by key; subsequent
      // rapid calls for the same entry are no-ops until this one completes.
      debounceTimersRef.current.forEach((t) => clearTimeout(t));
      debounceTimersRef.current.clear();
      void run();
    },
    [],
  );

  // --- Remove (optimistic with rollback) ------------------------------------
  const removeEntry = useCallback(
    async (anilistId: number) => {
      const previous = items.find((e) => e.anilistId === anilistId);
      if (!previous) return false;
      setItems((prev) => prev.filter((e) => e.anilistId !== anilistId));
      const result = await removeContinueWatching(anilistId);
      if (!result.ok) {
        // Rollback: restore the entry.
        setItems((prev) => {
          if (prev.some((e) => e.anilistId === anilistId)) return prev;
          return [...prev, previous].sort(
            (a, b) => b.updatedAt.localeCompare(a.updatedAt),
          );
        });
      }
      return result.ok;
    },
    [items],
  );

  return {
    status: cwStatus,
    error,
    items,
    isAuthenticated: status === "authenticated",
    saveProgress,
    removeEntry,
  };
}
