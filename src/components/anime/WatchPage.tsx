"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Play,
  Search,
} from "lucide-react";
import type { Anime, AnimeEpisode } from "@/lib/types";
import { getDisplayTitle } from "@/lib/anime";
import BackButton from "@/components/back-button";
import { useContinueWatching } from "@/hooks/use-continue-watching";

/** Timeout for the backend stream-resolution proxy call. */
const STREAM_RESOLVE_TIMEOUT_MS = 15_000;
/** Default language when none is requested. */
const DEFAULT_LANGUAGE: "sub" | "dub" = "sub";

/** Development-only timing markers to distinguish API latency from player init latency. */
const WATCH_TIMING = process.env.NODE_ENV === "development";
const watchMark = (name: string) => {
  if (WATCH_TIMING) {
    console.log(`[watch] ${name} @ ${performance.now().toFixed(0)}ms`);
  }
};

interface LanguageOption {
  value: "sub" | "dub";
  label: string;
}

const LANGUAGES: LanguageOption[] = [
  { value: "sub", label: "Sub" },
  { value: "dub", label: "Dub" },
];

/**
 * The OFF watch page: a large cinematic video player on the left (desktop)
 * with a compact, paginated episode selector on the right.
 *
 * Playback is provided by the backend-resolved `playbackUrl`, which is a
 * provider player page (HTML) designed to be embedded in an iframe — it is
 * NOT a direct media file, so it must not be fed to a native <video> element.
 * The provider's own player UI (play/pause, volume, seek, fullscreen) lives
 * inside the embed; this page owns episode selection, language, and the
 * resolve/load lifecycle only.
 *
 * Episode identity is driven by the backend's `globalEpisodeNumber`, which is
 * continuous across seasons. The frontend selects, navigates, and addresses
 * episodes by `globalEpisodeNumber` only. The same `globalEpisodeNumber` is
 * sent to the backend as the `ep` parameter when resolving the stream, so the
 * provider plays the exact episode the user selected — never a season-local
 * number that would resolve to a different episode after a season reset.
 *
 * Episodes are shown in fixed display ranges of 100 (1–100, 101–200, ...).
 * These are display ranges, not season boundaries: numbering never restarts
 * at 1 when a new season begins. A range picker and an episode search field
 * sit above the grid; switching ranges or searching never triggers a new
 * stream resolution — only selecting a different episode or language does.
 *
 * Server selection (Server 1 · AniList by default, Server 2 · MAL) resolves
 * through the backend's TWO registered namespace routes (backend.md §6;
 * ported from backend commit `cb3d6fe`):
 *
 *   Server 1 -> GET /api/stream/resolve/anilist/:id?ep=N&language=sub|dub
 *   Server 2 -> GET /api/stream/resolve/mal/:id?ep=N&language=sub|dub
 *
 * `:id` is the ID of the ROUTE'S OWN namespace — the AniList ID is never sent
 * on the MAL route and a MAL ID is never sent on the AniList route. Each route
 * resolves in its own namespace first and falls back only through the
 * backend's IdentityResolver (a provider-confirmed mapping), so the frontend
 * never guesses or fabricates IDs. Server 2 is disabled with an honest
 * explanation when the title has no MyAnimeList ID on record in the metadata.
 * The legacy unified route `/api/stream/resolve/:id` (AniList-only) remains
 * registered upstream for backward compatibility; the watch page uses the
 * explicit per-namespace routes instead.
 *
 * Because the embed is cross-origin, this page cannot read its playback
 * events (completion, current time, duration). Auto-next on natural
 * completion is therefore not reliably detectable; the Next Episode button is
 * the supported way to advance.
 *
 * The episode-number buttons only call `setSelectedGlobal` — they never
 * fetch a stream or touch streaming logic.
 */
export default function WatchPage({
  anime,
  episodes,
  initialEpisode,
  initialLanguage,
}: {
  anime: Anime;
  episodes: AnimeEpisode[];
  initialEpisode: number;
  initialLanguage: "sub" | "dub";
}) {
  const router = useRouter();
  const pathname = usePathname();

  const anilistId = anime.anilistId;
  const title = getDisplayTitle(anime);

  // Episodes usable for selection: must carry a usable global episode number.
  // Sorted ascending so numbering is continuous across seasons and never
  // restarts at 1 when a new season begins.
  const sortedEpisodes = useMemo(() => {
    return [...episodes]
      .filter(
        (ep): ep is Extract<AnimeEpisode, { globalEpisodeNumber: number }> =>
          typeof ep.globalEpisodeNumber === "number" &&
          ep.globalEpisodeNumber > 0,
      )
      .sort((a, b) => a.globalEpisodeNumber - b.globalEpisodeNumber);
  }, [episodes]);

  const byGlobal = useMemo(
    () => new Map(sortedEpisodes.map((ep) => [ep.globalEpisodeNumber, ep])),
    [sortedEpisodes],
  );
  const globalNumbers = sortedEpisodes.map((ep) => ep.globalEpisodeNumber);
  const firstGlobal = globalNumbers[0] ?? null;
  const lastGlobal = globalNumbers[globalNumbers.length - 1] ?? null;
  const hasEpisodes = globalNumbers.length > 0;

  // Selection state is the globalEpisodeNumber (canonical, continuous across
  // seasons). Fall back to the first available episode when the requested
  // number isn't present (e.g. stale URL, missing metadata).
  const [selectedGlobal, setSelectedGlobal] = useState<number>(() => {
    const requested = Math.max(1, initialEpisode || 0);
    return globalNumbers.includes(requested)
      ? requested
      : firstGlobal ?? 1;
  });

  // --- Episode range pagination ---
  // Display ranges are fixed chunks of 100 (1–100, 101–200, …). These are not
  // season boundaries; numbering never restarts at 1 across seasons. Only
  // ranges that contain at least one available episode are shown.
  const RANGE_SIZE = 100;
  const ranges = useMemo(() => {
    if (!hasEpisodes) return [];
    const result: Array<{ label: string; start: number; end: number }> = [];
    let start = 1;
    const max = lastGlobal ?? 1;
    while (start <= max) {
      const end = Math.min(start + RANGE_SIZE - 1, max);
      const hasInRange = sortedEpisodes.some(
        (ep) => ep.globalEpisodeNumber >= start && ep.globalEpisodeNumber <= end,
      );
      if (hasInRange) result.push({ label: `${start}–${end}`, start, end });
      start = end + 1;
    }
    return result;
  }, [sortedEpisodes, lastGlobal, hasEpisodes]);

  const rangeForGlobal = (global: number) => {
    if (!hasEpisodes) return null;
    const start = Math.floor((global - 1) / RANGE_SIZE) * RANGE_SIZE + 1;
    const end = Math.min(start + RANGE_SIZE - 1, lastGlobal ?? 1);
    return ranges.find((r) => r.start === start && r.end === end) ?? null;
  };

  // `pinnedRange` is the range the user explicitly opened via the picker. When
  // null the grid auto-follows the currently selected episode. Selecting an
  // episode (tile, next/prev, search) always unpins so the range follows.
  const [pinnedRange, setPinnedRange] = useState<
    | { label: string; start: number; end: number }
    | null
  >(null);
  const autoRange = rangeForGlobal(selectedGlobal);
  const selectedRange = pinnedRange ?? autoRange;
  /** Display label of the active range — a primitive, so hook dependency
      arrays that watch it stay statically checkable. */
  const selectedRangeLabel = selectedRange?.label ?? null;

  const handleSelectEpisode = useCallback(
    (global: number) => {
      setPinnedRange(null);
      setSelectedGlobal(global);
    },
    [],
  );

  // --- Episode search ---
  const [searchQuery, setSearchQuery] = useState("");
  const handleSearch = useCallback(
    (raw: string) => {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1 || !globalNumbers.includes(n)) {
        // Invalid or out-of-range input: do nothing, leave selection intact.
        return;
      }
      setPinnedRange(null);
      setSelectedGlobal(n);
      setSearchQuery("");
    },
    [globalNumbers],
  );

  // Episodes displayed in the current range only. Switching ranges filters the
  // grid without triggering a new stream resolution.
  const displayedEpisodes = useMemo(() => {
    if (!selectedRange) return sortedEpisodes;
    return sortedEpisodes.filter(
      (ep) =>
        ep.globalEpisodeNumber >= selectedRange.start &&
        ep.globalEpisodeNumber <= selectedRange.end,
    );
  }, [sortedEpisodes, selectedRange]);

  const [language, setLanguage] = useState(
    initialLanguage || DEFAULT_LANGUAGE,
  );

  // --- Server selection ---
  // Server 1 = AniList ID (default), Server 2 = MAL ID. The selected server is
  // preserved across episode and language changes; the episode, language and
  // anime are preserved when switching servers. Server 2 requires a REAL MAL
  // ID from the metadata (episode row first, then the anime row) — an
  // unavailable MAL ID disables the server with an explanation; it is never
  // replaced with an assumed-equal AniList ID.
  type ServerId = "anilist" | "mal";
  const SERVERS: ServerId[] = ["anilist", "mal"];
  const [server, setServer] = useState<ServerId>("anilist");

  // --- Playback state ---
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  /** True once the iframe has finished loading the current source. */
  const [playerReady, setPlayerReady] = useState(false);
  /** Languages the resolved payload advertises as available sources. */
  const [availableLanguages, setAvailableLanguages] = useState<Set<string>>(
    new Set(),
  );

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // AbortController for the in-flight resolution request, so rapid episode /
  // server / language switches cancel the previous HTTP request instead of
  // letting it race with the new one.
  const abortControllerRef = useRef<AbortController | null>(null);
  // Selection identity of the in-flight request. A response is only applied
  // if it still matches the currently selected anime, episode, server and
  // language; otherwise it is a stale response and is ignored.
  const activeSelectionRef = useRef<{
    anilistId: number;
    malId: number | null;
    global: number;
    server: ServerId;
    language: "sub" | "dub";
  } | null>(null);
  // Monotonically increasing sequence so stale resolution responses can be
  // ignored when the user switches episodes rapidly.
  const requestSeqRef = useRef(0);
  // Last embed URL actually mounted, so the iframe is only reloaded when the
  // resolved URL genuinely changes (episode or language switch).
  const lastAppliedUrlRef = useRef<string | null>(null);
  // Scrollable body of the episodes panel + the currently selected tile,
  // used to keep the selection visible inside the panel when the grid
  // auto-follows (Prev/Next, search, deep links) on long-running shows.
  const panelScrollRef = useRef<HTMLDivElement | null>(null);
  const currentTileRef = useRef<HTMLButtonElement | null>(null);

  const selectedEpisode = byGlobal.get(selectedGlobal);

// Persist continue-watching position (guest-safe: the hook no-ops without a
// session; deduped by entry so episode switches don't multiply requests).
const { saveProgress } = useContinueWatching();
useEffect(() => {
  if (hasEpisodes) saveProgress(anilistId, selectedGlobal);
}, [saveProgress, anilistId, selectedGlobal, hasEpisodes]);

  // The MAL ID for Server 2 lookups: prefer the episode row's own MAL id,
  // fall back to the anime row's. Never assume AniList and MAL IDs are
  // interchangeable — when neither carries a MAL ID, Server 2 is disabled.
  const malId = selectedEpisode?.malId ?? anime.malId ?? null;
  const canUseMalServer = malId !== null && malId > 0;

  const isLastEpisode = selectedGlobal >= (lastGlobal ?? 1);
  const isFirstEpisode = selectedGlobal <= (firstGlobal ?? 1);

  const languageIsAvailable = useCallback(
    (value: "sub" | "dub") =>
      availableLanguages.size === 0 || availableLanguages.has(value),
    [availableLanguages],
  );

  // Keep the URL's episode/language in sync with selection without remounting
  // the page (replace → no extra history entry, client-side only).
  const lastSyncedUrlRef = useRef<string | null>(null);
  const syncUrl = useCallback(
    (ep: number, lang: "sub" | "dub") => {
      const desired = `${pathname}?ep=${ep}&language=${lang}`;
      // Skip replaces that change nothing. The watch page is `revalidate = 0`,
      // so even an identical `router.replace` triggers a full RSC re-render
      // (fresh `anime`/`episodes` identities) — with the old unconditional
      // replace that rendered into another resolve request, which after a 404
      // made the failure repeat forever. A replace only fires when either the
      // live URL is already exactly right, or it was synced this render.
      if (lastSyncedUrlRef.current === desired) return;
      if (`${window.location.pathname}${window.location.search}` === desired) {
        lastSyncedUrlRef.current = desired;
        return;
      }
      lastSyncedUrlRef.current = desired;
      router.replace(desired, { scroll: false });
    },
    [pathname, router],
  );

  // --- Playback controller: resolve the stream URL ---
  const resolveStream = useCallback(
    async (global: number, lang: "sub" | "dub", serverId: ServerId) => {
      // Cancel any in-flight resolution request so rapid episode / server /
      // language switches never race with a newer selection.
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const seq = (requestSeqRef.current += 1);
      setResolving(true);
      setResolveError(null);
      setPlaybackError(null);
      setPlayerReady(false);
      watchMark("resolve-start");

      const episode = byGlobal.get(global);
      if (!episode) {
        if (seq !== requestSeqRef.current) return;
        setResolving(false);
        setResolveError(
          "No episode metadata is available for this episode. Please try another episode.",
        );
        return;
      }

      // Record the identity of this selection so stale responses can be
      // detected even if they happen to carry the latest sequence number.
      activeSelectionRef.current = {
        anilistId,
        malId,
        global,
        server: serverId,
        language: lang,
      };

      // Build the per-namespace resolve URL for the backend's registered
      // routes (backend.md §6; ported from backend commit `cb3d6fe`):
      //   Server 1 → /api/stream/resolve/anilist/:id with the AniList ID.
      //   Server 2 → /api/stream/resolve/mal/:id with the REAL MAL ID from
      //              the metadata (episode row, else the anime row).
      // IDs are never swapped or adjacency-assumed: an unavailable MAL ID
      // disables Server 2 with an honest explanation instead of silently
      // sending an AniList ID there. `ep` carries the canonical
      // globalEpisodeNumber (never a season-local number); the controller
      // also honors the documented `episode` alias, `ep` wins.
      let resolveUrl: string;
      if (serverId === "mal") {
        if (!malId || malId <= 0) {
          if (seq !== requestSeqRef.current) return;
          setResolving(false);
          setResolveError(
            "Server 2 is unavailable: this title has no MyAnimeList id on record.",
          );
          return;
        }
        resolveUrl = `/api/stream/resolve/mal/${malId}?ep=${episode.globalEpisodeNumber}&language=${lang}`;
      } else {
        resolveUrl = `/api/stream/resolve/anilist/${anilistId}?ep=${episode.globalEpisodeNumber}&language=${lang}`;
      }

      let response: Response;
      try {
        response = await fetch(resolveUrl, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(STREAM_RESOLVE_TIMEOUT_MS),
          ]),
          headers: { accept: "application/json" },
        });
      } catch {
        if (seq !== requestSeqRef.current) return;
        setResolving(false);
        setResolveError(
          "The stream resolver could not be reached. Please try again.",
        );
        return;
      }

      watchMark("resolve-response");

      // Ignore responses that no longer match the current selection (e.g. a
      // slow request for a previous episode that completes after the user
      // has already switched).
      const active = activeSelectionRef.current;
      if (
        !active ||
        active.anilistId !== anilistId ||
        active.malId !== malId ||
        active.global !== global ||
        active.server !== serverId ||
        active.language !== lang
      ) {
        return;
      }
      if (seq !== requestSeqRef.current) return;

      setResolving(false);

      if (!response.ok) {
        // A failed status NEVER auto-retries (no fetch loop) — the visible
        // Retry button is the only retry path. The backend's typed error body
        // (`error.message`) is surfaced verbatim when present so failure
        // classes read distinctly (404 route/not-found, 400 validation, 502
        // provider, etc.).
        const upstreamError = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        const detail = upstreamError?.error?.message?.trim() || null;
        setResolveError(
          detail
            ? `${detail} (HTTP ${response.status})`
            : `Stream resolution failed (HTTP ${response.status}). Try another episode or language.`,
        );
        return;
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        if (seq !== requestSeqRef.current) return;
        setResolveError("The stream resolver returned an invalid response.");
        return;
      }
      if (seq !== requestSeqRef.current) return;

      const resolved = payload as {
        playbackUrl?: string | null;
        resolved?: boolean;
        episode?: number;
        language?: string;
        provider?: string;
        idType?: string;
        sources?: Array<{ language?: string }>;
        streams?: Record<string, { url?: string | null; type?: string; language?: string }>;
      };

      if (resolved.resolved !== true) {
        setResolveError(
          "No playable stream is available for this episode and language.",
        );
        return;
      }

      // Prefer the stream URL matching the currently selected language, with
      // the top-level playbackUrl as a fallback. Never fabricate a URL.
      const languageStreamUrl =
        resolved.streams?.[lang]?.url ?? resolved.playbackUrl ?? null;
      if (!languageStreamUrl) {
        setResolveError(
          "No playable stream is available for this episode and language.",
        );
        return;
      }

      // Remember which languages this anime/episode advertises as sources so
      // we can disable the SUB/DUB buttons for languages the backend cannot
      // serve for this episode.
      const languages = new Set<string>();
      for (const source of resolved.sources ?? []) {
        if (source.language) languages.add(source.language);
      }
      for (const key of Object.keys(resolved.streams ?? {})) {
        languages.add(key);
      }
      setAvailableLanguages(languages);

      setPlaybackUrl(languageStreamUrl);
      setPlaybackError(null);
    },
    [anilistId, byGlobal, malId],
  );

  // Mount / reload the embed when the resolved URL changes. React owns the
  // `src` attribute, so a new episode/language triggers a fresh iframe load.
  useEffect(() => {
    if (!playbackUrl || playbackUrl === lastAppliedUrlRef.current) return;
    lastAppliedUrlRef.current = playbackUrl;
    setPlayerReady(false);
    const iframe = iframeRef.current;
    if (!iframe) return;
    // Force the embed to navigate to the new URL even if the element is
    // reused, so switching episodes always loads the new stream.
    watchMark("player-source-assigned");
    iframe.src = playbackUrl;
  }, [playbackUrl]);

  // Latest resolver callback, read at effect time through a ref: soft-nav
  // re-renders (which hand the page fresh `anime`/`episodes` identities)
  // cannot re-fire this effect through callback identity churn, and any
  // response guard reads the callback that matches the newest render.
  const resolveRef = useRef(resolveStream);
  resolveRef.current = resolveStream;
  // Monotonic guard for the effect: one resolution request per unique
  // combination of anime, episode, server and language. Identity replays —
  // React StrictMode remounts, and re-renders from `router.replace` soft
  // navigations — never trigger a second automatic request; a genuine change
  // of ANY of the four always re-resolves. Manual Retry calls `resolveRef`
  // directly and does not go through this effect.
  const lastAutoResolveKeyRef = useRef<string | null>(null);

  // Re-resolve ONLY when the resolution identity actually changes.
  useEffect(() => {
    const normalized = Math.max(1, selectedGlobal);
    if (normalized !== selectedGlobal) setSelectedGlobal(normalized);
    const key = `${anilistId}:${normalized}:${language}:${server}`;
    if (lastAutoResolveKeyRef.current === key) return;
    lastAutoResolveKeyRef.current = key;
    resolveRef.current(normalized, language, server);
  }, [selectedGlobal, language, anilistId, server]);

  // Sync URL on selection changes (episode + language).
  useEffect(() => {
    syncUrl(selectedGlobal, language);
  }, [selectedGlobal, language, syncUrl]);

  // Keep the currently selected episode tile visible inside the scrollable
  // panel body. Scroll math uses viewport-relative deltas between the panel
  // and the tile, so only the panel body ever scrolls — never the page.
  useEffect(() => {
    const body = panelScrollRef.current;
    const tile = currentTileRef.current;
    if (!body || !tile) return;
    const margin = 12;
    const bodyTop = body.getBoundingClientRect().top;
    const tileTop = tile.getBoundingClientRect().top;
    const tileBottom = tileTop + tile.getBoundingClientRect().height;
    const bodyBottom = bodyTop + body.clientHeight;
    if (tileTop - margin < bodyTop) {
      body.scrollTop += tileTop - bodyTop - margin;
    } else if (tileBottom + margin > bodyBottom) {
      body.scrollTop += tileBottom - bodyBottom + margin;
    }
  }, [selectedGlobal, selectedRangeLabel]);

  const handleIframeError = useCallback(() => {
    // The embed failed to load (network / provider restriction / unsupported
    // URL). We cannot read cross-origin playback events, so treat a load
    // failure as a playback error the user can retry.
    setPlaybackError(
      "The video player failed to load. Please try again or select another episode.",
    );
  }, []);

  /** The iframe fired its load event: the player source is ready. */
  const handleIframeLoad = useCallback(() => {
    setPlayerReady(true);
    setPlaybackError(null);
    watchMark("player-loaded");
  }, []);

  const nextEpisode = useCallback(() => {
    if (!hasEpisodes || isLastEpisode || !languageIsAvailable(language)) return;
    const next = sortedEpisodes.find(
      (ep) => ep.globalEpisodeNumber > selectedGlobal,
    );
    if (next) handleSelectEpisode(next.globalEpisodeNumber);
  }, [hasEpisodes, isLastEpisode, language, languageIsAvailable, selectedGlobal, sortedEpisodes, handleSelectEpisode]);

  const previousEpisode = useCallback(() => {
    if (!hasEpisodes || isFirstEpisode || !languageIsAvailable(language)) return;
    const prev = [...sortedEpisodes]
      .reverse()
      .find((ep) => ep.globalEpisodeNumber < selectedGlobal);
    if (prev) handleSelectEpisode(prev.globalEpisodeNumber);
  }, [hasEpisodes, isFirstEpisode, language, languageIsAvailable, selectedGlobal, sortedEpisodes, handleSelectEpisode]);

  // --- Render ---
  const currentLanguage = LANGUAGES.find((l) => l.value === language);

  // True while the API is resolving OR the iframe has a source but has not
  // yet fired its load event. Distinguishes API resolution latency from
  // player initialization latency.
  const playerLoading =
    !!playbackUrl && !playerReady && !playbackError && !resolving;

  return (
    <div className="relative min-h-[100svh] w-full bg-[#050507] text-white">
      {/* Episode information header — sits below the fixed navbar (pt-24
          clears it) and carries the title, episode position, language
          indicator, and the preserved server selector. */}
      <header className="watch-enter px-6 pb-5 pt-24 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-[1520px] flex-wrap items-center gap-x-4 gap-y-4">
          <BackButton className="glass-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
            <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
          </BackButton>

          <div className="min-w-0">
            <h1 className="type-display truncate text-[32px] sm:text-40px lg:text-[52px]">
              {title}
            </h1>
            <div className="type-label mt-1 flex items-center gap-2.5 text-[11px] uppercase text-white/45 sm:text-xs">
              <span>Episode {selectedGlobal}</span>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/25" />
              <span>{hasEpisodes ? `of ${lastGlobal}` : "Unavailable"}</span>
              <span aria-hidden="true" className="watch-dot" />
              <span className="text-sky-200/90">
                {currentLanguage?.label.toUpperCase() ?? "SUB"}
              </span>
            </div>
          </div>

          {/* Server selector (preserved): Server 1 · AniList, Server 2 · MAL.
              Kept outside the control bar so SUB/DUB and the episode arrows
              own the row beneath the player. */}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="type-label mr-1 hidden text-[10px] uppercase text-white/30 md:block">
              Server
            </span>
            {SERVERS.map((serverId) => {
              const label =
                serverId === "anilist" ? "Server 1 · AniList" : "Server 2 · MAL";
              // Server 2 resolves the MAL route ONLY with a real MAL ID from
              // the metadata (episode row, else the anime row). Without one it
              // is disabled with an honest explanation — an AniList ID is
              // never silently passed as a MAL ID.
              const disabled = serverId === "mal" && !canUseMalServer;
              const active = server === serverId;
              return (
                <button
                  key={serverId}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled && server !== serverId) {
                      setServer(serverId);
                    }
                  }}
                  aria-pressed={active}
                  aria-label={label}
                  title={
                    disabled
                      ? "Server 2 unavailable: no MyAnimeList id on record"
                      : undefined
                  }
                  className={`glass-btn type-label shrink-0 rounded-full px-3.5 py-1.5 text-xs transition-colors duration-200 hover:opacity-95 ${
                    active ? "watch-chip--on" : ""
                  } ${
                    disabled ? "text-white/30 pointer-events-none" : "text-white/75"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="relative z-0 w-full px-6 pb-28 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[1520px]">
          {/* Desktop: player takes 76%, episodes 24%, both top-aligned.
              Mobile: player stacks above the episode panel. */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,19fr)_minmax(0,6fr)] lg:gap-8">
            {/* Left — video player (76%). min-w-0 keeps the 76% share intact
                even when the panel's contents would demand more room. */}
            <div className="watch-enter--player min-w-0">
              {/* 16:9 embed frame. The MegaPlay provider player (resolved
                  playbackUrl) loads inside the iframe; its native controls
                  stay functional because every overlay is either hidden or
                  pointer-events-none once playback is running. aspect-video
                  derives the frame's full height from its full column
                  width — no fixed size, no max-height. */}
              <div className="watch-player-frame aspect-video relative w-full overflow-hidden rounded-[20px] border border-white/10 bg-[#08080c] shadow-[0_36px_110px_-30px_rgba(0,0,0,0.9),0_12px_40px_-8px_rgba(0,0,0,0.55)]">
                {(resolving || playerLoading) ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#050507]/85 backdrop-blur-md">
                    <Loader2
                      className="mb-2.5 h-8 w-8 animate-spin text-white/80"
                      aria-hidden="true"
                    />
                    <p
                      aria-live="polite"
                      className="type-label text-xs uppercase text-white/55"
                    >
                      {resolving ? "Resolving stream" : "Loading player"}
                    </p>
                  </div>
                ) : null}

                {!!playbackUrl && !playbackError ? (
                  <iframe
                    ref={iframeRef}
                    src={playbackUrl}
                    title={`${title} episode ${selectedGlobal} player`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                    className="block h-full w-full bg-black"
                    loading="eager"
                    onLoad={handleIframeLoad}
                    onError={handleIframeError}
                  />
                ) : null}

                {!playbackUrl && !resolving && !playbackError && !resolveError ? (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#050507]/60 backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => resolveStream(selectedGlobal, language, server)}
                      className="glass-btn glass-btn--bright relative flex h-16 w-16 items-center justify-center rounded-full text-[#0b0b0f] hover:opacity-95"
                      aria-label="Play"
                    >
                      <Play
                        className="h-6 w-6 translate-x-[1px] fill-current"
                        aria-hidden="true"
                      />
                      <span
                        aria-hidden="true"
                        className="watch-play-pulse absolute inset-0 rounded-full border border-white/50"
                      />
                    </button>
                    <p className="type-label text-[11px] uppercase text-white/45">
                      Start playback
                    </p>
                  </div>
                ) : null}

                {resolveError || playbackError ? (
                  <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1 bg-[#050507]/92 px-6 text-center backdrop-blur-md">
                    <h2 className="type-display max-w-lg text-[17px] leading-relaxed text-white">
                      {resolveError ?? playbackError}
                    </h2>
                    <button
                      type="button"
                      onClick={() => resolveStream(selectedGlobal, language, server)}
                      className="glass-btn type-label mt-4 inline-flex h-10 items-center justify-center rounded-full px-6 text-sm text-white hover:opacity-95"
                    >
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Episode controls — outside the player frame (never inside
                  the iframe or navbar). Previous and Next hold the outer
                  edges; the SUB/DUB segmented control anchors the middle. */}
              <div className="mt-5 grid grid-cols-1 items-center justify-items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:justify-items-stretch">
                <div className="sm:justify-self-start">
                  <button
                    type="button"
                    disabled={isFirstEpisode || !hasEpisodes || !languageIsAvailable(language)}
                    onClick={previousEpisode}
                    aria-label="Previous episode"
                    className={`glass-btn type-label inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm text-white sm:px-6 ${
                      isFirstEpisode || !hasEpisodes || !languageIsAvailable(language)
                        ? "text-white/30 pointer-events-none"
                        : ""
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </button>
                </div>

                <div className="justify-self-center">
                  <div
                    className="watch-seg"
                    role="group"
                    aria-label="Audio language"
                  >
                    <span
                      aria-hidden="true"
                      className="watch-seg-thumb"
                      style={{
                        transform:
                          language === "dub"
                            ? "translateX(calc(100% + 3px))"
                            : "translateX(0)",
                      }}
                    />
                    {LANGUAGES.map((option) => {
                      const available = languageIsAvailable(option.value);
                      const active = language === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!available}
                          onClick={() => available && setLanguage(option.value)}
                          aria-pressed={active}
                          aria-label={available
                            ? `Switch to ${option.label} audio`
                            : `${option.label} audio not available`}
                          className={`watch-seg-btn ${active ? "watch-seg-btn--on" : ""}`}
                        >
                          {option.label.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:justify-self-end">
                  <button
                    type="button"
                    disabled={isLastEpisode || !hasEpisodes || !languageIsAvailable(language)}
                    onClick={nextEpisode}
                    aria-label="Next episode"
                    className={`glass-btn type-label inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-5 text-sm text-white sm:px-6 ${
                      isLastEpisode || !hasEpisodes || !languageIsAvailable(language)
                        ? "text-white/30 pointer-events-none"
                        : ""
                    }`}
                  >
                    Next Episode
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {/* Right — episodes panel (24%). Sticky so the selector follows
                while the show plays. */}
            <div className="min-w-0">
              <section className="watch-enter--panel sticky top-24">
                <h2 className="type-label mb-3 px-0.5 text-sm uppercase text-white/90 sm:text-[15px]">
                  Episodes
                </h2>

                <div className="glass-panel overflow-hidden rounded-2xl">
                  {hasEpisodes ? (
                    <>
                      {/* Compact current-title + episode position. */}
                      <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-3.5">
                        <p
                          className="type-label min-w-0 truncate text-xs text-white/75"
                          title={title}
                        >
                          {title}
                        </p>
                        <p className="type-label shrink-0 text-[11px] text-white/40 tabular-nums">
                          EP {selectedGlobal}
                          <span className="text-white/25">/{lastGlobal ?? "—"}</span>
                        </p>
                      </div>

                      {/* Range picker + episode search — filtering the grid
                          never triggers a new stream resolution. */}
                      <div className="flex items-center gap-2 px-4 pb-2">
                        <label className="relative shrink-0">
                          <span className="sr-only">Episode range</span>
                          <select
                            value={selectedRange?.label ?? ""}
                            onChange={(e) => {
                              const picked = ranges.find((r) => r.label === e.target.value);
                              if (picked) setPinnedRange(picked);
                            }}
                            className="watch-input type-label h-9 w-[7.5rem] appearance-none pl-2.5 pr-7 text-xs text-white/90"
                          >
                            {ranges.map((r) => (
                              <option key={r.label} value={r.label}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40"
                            aria-hidden="true"
                          />
                        </label>
                        <div className="relative min-w-0 flex-1">
                          <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
                            aria-hidden="true"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSearch(searchQuery);
                            }}
                            placeholder="Search episode…"
                            aria-label="Search episode number"
                            className="watch-input h-9 w-full pl-8 pr-2.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      <div aria-hidden="true" className="border-t border-white/[0.06]" />

                      <div
                        ref={panelScrollRef}
                        className="watch-panel-scroll max-h-[clamp(320px,calc(100svh-300px),760px)] overflow-y-auto px-3.5 pb-3.5 pt-3"
                      >
                        {displayedEpisodes.length > 0 ? (
                          <ul
                            className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5"
                            role="list"
                            aria-label={`Episodes ${selectedRange?.start ?? firstGlobal ?? ""}–${selectedRange?.end ?? lastGlobal ?? ""}`}
                          >
                            {displayedEpisodes.map((ep) => {
                              const isCurrent = ep.globalEpisodeNumber === selectedGlobal;
                              return (
                                <li key={ep.globalEpisodeNumber}>
                                  <button
                                    ref={isCurrent ? currentTileRef : undefined}
                                    type="button"
                                    onClick={() => handleSelectEpisode(ep.globalEpisodeNumber)}
                                    aria-pressed={isCurrent}
                                    aria-current={isCurrent ? "true" : undefined}
                                    aria-label={`Episode ${ep.globalEpisodeNumber}`}
                                    className={`watch-tile type-label h-10 w-full text-sm tabular-nums lg:h-11 ${
                                      isCurrent ? "watch-tile--current" : ""
                                    }`}
                                  >
                                    {ep.globalEpisodeNumber}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="px-1 py-6 text-center text-xs text-white/40">
                            No episodes in this range.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="px-4 py-7 text-center text-sm text-white/50">
                      No episode metadata available for this title.
                    </p>
                  )}
                </div>

                {!hasEpisodes ? (
                  <p className="mt-3 px-1 text-center text-[11px] text-white/40">
                    Episode count unavailable.
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
