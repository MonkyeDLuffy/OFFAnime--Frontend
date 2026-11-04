"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";
import SearchResultRow from "./SearchResultRow";
import type { SearchCard } from "@/lib/types";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_ANIME_CATEGORY,
  buildSearchUrl,
  isSearchQueryTooShort,
  searchAnimeByQuery,
} from "@/lib/search-client";

/**
 * Global search popup (navbar) — the OFFANIME take on the reference overlay:
 * a centered dark-glass modal over a blurred, dimmed page, header row
 * (icon · input · Clear · close), category tabs below the header, and an
 * independently scrollable poster-based result list. Native to the Liquid
 * Glass system (see .search-* styles in globals.css), never a re-design of
 * the navbar.
 *
 * Request discipline (task parts 2/6/9 — VERY IMPORTANT):
 *  - a 400ms debounce runs ahead of everything: exactly ONE request fires per
 *    settled query, re-started by every keystroke, so "n/na/nar/…" never
 *    multiplies requests;
 *  - every change of the search identity (query·category) clears the pending
 *    timer AND aborts an in-flight request (AbortController) — a stale
 *    response can never overwrite a newer one (double-guarded by a
 *    controller-identity check);
 *  - identical searches are deduplicated (last-fetch key) and there is NO
 *    retry: a failed request renders the honest error state with a Retry
 *    button that acts once;
 *  - opening the modal fires NO request (hint state until ≥2 characters);
 *    typing below the minimum resets results and never fetches;
 *  - typing never re-binds state through churn: the settle effect depends
 *    only on the identity key.
 *
 * Keyboard: autofocus on open, Escape closes, click-outside closes, ArrowUp/
 * ArrowDown rove the result list (highlight + scroll into view), Enter in the
 * input navigates to /search?q=… with the exact current query (URL-encoded) —
 * even while the debounce is still pending (the dedicated page owns its own
 * fetch; nothing stale is carried over). Focus is restored to the navbar
 * button on close and Tab is trapped inside the dialog.
 */

/** Categories rendered from REAL backend capability only (task part 4). The
    backend exposes a single anime search endpoint (GET /api/search); its
    TMDB/Jikan routes are lookups by-ID with no search surface, so no Movies
    & TV / Manga tab exists — enabling more categories is a backend change
    (report, not invention) that slots into this record + dedupe key above. */
const SEARCH_CATEGORIES = [
  { id: SEARCH_ANIME_CATEGORY, label: "Anime" },
] as const;

type SearchCategoryId = (typeof SEARCH_CATEGORIES)[number]["id"];

type RowStatus =
  | "idle" // below minimum length — hint, no request
  | "loading" // timer running or request in flight
  | "results"
  | "similar"
  | "empty"
  | "error";

interface SearchModalProps {
  onClose: () => void;
}

/** Closing animation length — keep in sync with globals.css. */
const CLOSE_ANIMATION_MS = 170;

function statusFromKind(
  kind: "results" | "similar" | "empty",
): RowStatus {
  return kind === "results" ? "results" : kind === "similar" ? "similar" : "empty";
}

export default function SearchModal({ onClose }: SearchModalProps) {
  const router = useRouter();

  // ---- Open/close shell ----------------------------------------------------
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const portalHostRef = useRef<HTMLElement | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (closeTimerRef.current !== null) return; // already closing
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose]);

  // ---- Search state --------------------------------------------------------
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategoryId>(SEARCH_ANIME_CATEGORY);
  const [status, setStatus] = useState<RowStatus>("idle");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [arrowIndex, setArrowIndex] = useState(-1);
  /** Bumped by the manual Retry action; re-runs the debounce effect for the
      SAME identity (which also forgets the settled-fetch key). */
  const [retryNudge, setRetryNudge] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef<string | null>(null);

  const trimmed = query.trim();
  // Identity of the current search; EVERY fetch key includes the category so
  // tab switches reuse the same debounce/abort system instead of multiplying
  // requests.
  const searchKey = `${category}:${trimmed}`;

  // Portal host (client-only SSR guard).
  useEffect(() => {
    portalHostRef.current = document.body;
    setPortalHost(document.body);
  }, []);

  // Focus the input on open; restore the opener's focus on unmount; lock page
  // scroll while open (each effect only tears down its own work, so
  // StrictMode's double-run stays harmless).
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
    };
  }, []);

  // Autofocus once the portal content actually exists (the host is set in an
  // effect, so the input mounts one render AFTER this component's mount —
  // focusing in the mount effect would hit a null ref).
  useEffect(() => {
    if (portalHost) inputRef.current?.focus();
  }, [portalHost]);

  // Global Escape: close even when focus has left the dialog (dialogs must
  // not trap users solely by their focused descendants).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  // Never leave a pending close timer behind.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // ---- Debounced fetch effect ----------------------------------------------
  // One shared effect for every category: debounce → abort-outdated → dedupe
  // identical queries → single apply. Dependencies are ONLY the identity, so
  // re-renders can never re-fire it.
  useEffect(() => {
    const applyOutcome = (outcome: Awaited<ReturnType<typeof searchAnimeByQuery>>) => {
      if (outcome.kind === "error") {
        setStatus("error");
        setErrorMessage(outcome.message);
        return;
      }
      setErrorMessage(null);
      setStatus(statusFromKind(outcome.kind));
      setResults(outcome.kind === "empty" ? [] : outcome.results);
      setTotal(outcome.kind === "empty" ? null : outcome.total);
    };

    if (isSearchQueryTooShort(trimmed)) {
      // Below minimum: hint state, NO request ever, and forget the previous
      // fetch key so retyping the same query re-runs the flow cleanly.
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
      abortRef.current = null;
      lastFetchKeyRef.current = null;
      setStatus("idle");
      setResults([]);
      setTotal(null);
      setErrorMessage(null);
      return;
    }

    if (lastFetchKeyRef.current === searchKey) {
      return; // identical query already settled here — no refetch
    }

    setStatus("loading");
    setResults([]); // previous query's rows must never masquerade as new ones
    setErrorMessage(null);
    setArrowIndex(-1);

    const timer = window.setTimeout(
      () => {
        // Identical in-flight/settled dedupe (task part 9).
        if (lastFetchKeyRef.current === searchKey) return;
        lastFetchKeyRef.current = searchKey;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        searchAnimeByQuery(trimmed, controller.signal)
          .then((outcome) => {
            if (controller.signal.aborted || abortRef.current !== controller) return;
            applyOutcome(outcome);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || abortRef.current !== controller) return;
            const message =
              error instanceof Error && error.message
                ? error.message
                : "Search could not be completed right now.";
            setStatus("error");
            setErrorMessage(message);
            setResults([]);
            setTotal(null);
          })
          .finally(() => {
            if (abortRef.current === controller) abortRef.current = null;
          });
      },
      SEARCH_DEBOUNCE_MS,
    );
    timerRef.current = timer;

    return () => {
      // Keystrokes during the window restart the timer; a genuine identity
      // change also cancels any outdated in-flight request (AbortController).
      window.clearTimeout(timer);
      timerRef.current = null;
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, retryNudge]);

  // ---- Clear / close handlers ----------------------------------------------
  /** Click-outside: only a press on the scrim itself (target === scrim)
      closes; presses on the panel/its children never do. */
  const handleScrimMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        event.preventDefault();
        requestClose();
      }
    },
    [requestClose],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setTotal(null);
    setErrorMessage(null);
    setStatus("idle");
    setArrowIndex(-1);
    lastFetchKeyRef.current = null;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    inputRef.current?.focus();
  }, []);

  const handleTabSelect = useCallback(
    (id: SearchCategoryId) => {
      if (id === category) return;
      // Query is preserved across tabs; the same debounce/abort/dedupe
      // pipeline reruns through the identity effect above.
      setCategory(id);
    },
    [category],
  );

  // ---- Keyboard: Enter / Escape / arrows / Tab-trap -------------------------
  const moveArrow = useCallback(
    (delta: number) => {
      setArrowIndex((prev) => {
        const count = results.length;
        if (count === 0) return -1;
        const next = prev === -1 ? (delta > 0 ? 0 : count - 1) : (prev + delta + count) % count;
        rowRefs.current[next]?.focus();
        return next;
      });
    },
    [results.length],
  );

  const submitToResultsPage = useCallback(() => {
    const current = query.trim();
    // Exact current query — never the values of a pending debounce that is
    // about to be discarded; the /search page runs its own fresh fetch.
    if (current.length < SEARCH_MIN_QUERY_LENGTH) return;
    router.push(buildSearchUrl(current));
    requestClose();
  }, [query, requestClose, router]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveArrow(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveArrow(-1);
        return;
      }
      if (event.key === "Tab") {
        // Minimal focus trap: keep Tab cycling inside the dialog.
        const container = portalHostRef.current?.querySelector(".search-panel");
        if (!container) return;
        const focusables = Array.from(
          container.querySelectorAll<HTMLElement>(
            "a[href], button:not([disabled]), input",
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || active === container)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "Enter" && event.target === inputRef.current) {
        event.preventDefault();
        submitToResultsPage();
      }
    },
    [moveArrow, requestClose, submitToResultsPage],
  );

  // ---- Derived view ---------------------------------------------------------
  const loading = status === "loading";
  const hasContent = status === "results" || status === "similar";
  const hintVisible = status === "idle";
  const emptyVisible = status === "empty";
  const errorVisible = status === "error";
  const clearable = query.length > 0;

  return portalHost
    ? createPortal(
        <div className="search-scrim" data-state={closing ? "closing" : "open"} onMouseDown={handleScrimMouseDown}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search OFFAnime"
            className="search-panel"
            data-state={closing ? "closing" : "open"}
            onKeyDown={onKeyDown}
          >
            {/* Header — icon · input · Clear · close (reference proportions) */}
            <div className="search-header">
              <span className="search-glyph" aria-hidden="true">
                {loading ? (
                  <Loader2 className="search-spin" size={20} />
                ) : (
                  <Search size={20} />
                )}
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value.slice(0, SEARCH_QUERY_MAX_LENGTH));
                }}
                placeholder="Search anime titles…"
                aria-label="Search anime titles"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className="search-input"
              />
              {clearable ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="search-clear type-label"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              ) : null}
              <button
                type="button"
                onClick={requestClose}
                className="search-close"
                aria-label="Close search"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            {/* Category tabs — backend-supported categories only */}
            <div className="search-tabs" role="tablist" aria-label="Search categories">
              {SEARCH_CATEGORIES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={category === entry.id}
                  onClick={() => handleTabSelect(entry.id)}
                  className={`search-tab type-label ${
                    category === entry.id ? "search-tab--active" : ""
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {/* Results — fixed-height area with independent scrolling */}
            <div className="search-body search-scroll">
              {hintVisible ? (
                <p className="search-hint">
                  Type at least {SEARCH_MIN_QUERY_LENGTH} characters to search.
                  Press{" "}
                  <kbd className="search-kbd">Enter</kbd> to open the full results
                  page.
                </p>
              ) : null}

              {loading ? (
                <p className="search-hint search-hint--soft" aria-live="polite">
                  Searching…
                </p>
              ) : null}

              {errorVisible ? (
                <div className="search-state" role="alert">
                  <p className="search-state-title">Search failed</p>
                  <p className="search-state-text">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => {
                      // Manual, single-bump retry: forget the settled key and
                      // nudge the identity effect to re-run its debounce once.
                      // Not a loop — nothing retries automatically.
                      lastFetchKeyRef.current = null;
                      setRetryNudge((value) => value + 1);
                    }}
                    className="search-retry glass-btn glass-btn--dark type-label"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {emptyVisible ? (
                <div className="search-state">
                  <p className="search-state-title">No results{trimmed ? ` for “${trimmed}”` : ""}</p>
                  <p className="search-state-text">
                    Check the spelling or try a broader title.
                  </p>
                </div>
              ) : null}

              {hasContent ? (
                <>
                  {status === "similar" ? (
                    <p className="search-similar-note" aria-live="polite">
                      No exact match — closest matches for “{trimmed}”
                    </p>
                  ) : null}
                  <ul className="search-rows" aria-label="Search results">
                    {results.map((card, index) => (
                      <SearchResultRow
                        key={card.anilistId}
                        index={index}
                        card={card}
                        highlighted={arrowIndex === index}
                        onFocusAnnounce={setArrowIndex}
                        rowFocusRef={(node) => {
                          rowRefs.current[index] = node;
                        }}
                        onNavigate={requestClose}
                      />
                    ))}
                  </ul>
                  {typeof total === "number" && total > results.length ? (
                    <p className="search-footnote">
                      Showing {results.length} of {total} — press{" "}
                      <kbd className="search-kbd">Enter</kbd> for the full results page
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>,
        portalHost,
      )
    : null;
}
