/**
 * Guest bookmark intent ("save pending login").
 *
 * When a signed-out visitor hits the watchlist toggle, they are sent to the
 * existing login flow (the dedicated /login page — there is no separate
 * modal in this codebase) with `?next=` preserving the page. The title they
 * tried to save is kept here so the watchlist store can complete the
 * interrupt AFTER successful sign-in — the visitor never loses their intent.
 *
 * Storage choice: `sessionStorage` — this is a TRANSIENT hand-off between
 * two clicks, not data. The watchlist itself never lives in browser storage
 * (docs/watchlist/BACKEND_CONTRACT.md): reading/validating/consuming this
 * value is the only thing it is good for. It survives client-side
 * navigation to /login and a hard reload of the login page, and it dies
 * with the tab so an abandoned sign-in leaves nothing behind.
 */

import type { WatchlistEntryInput } from "./types";

const INTENT_KEY = "offanime:watchlist-intent:v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/** Validate a stored intent without trusting its shape. */
function parseIntent(raw: string | null): WatchlistEntryInput | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    // The AniList ID: stored as `animeId` (the real contract's field name);
    // an older tab may still hold the pre-rewire `anilistId` spelling.
    const animeId =
      ([record.animeId, record.anilistId].find(
        (value) =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value > 0,
      ) as number | undefined) ?? null;
    if (animeId === null) return null;
    return {
      animeId,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : "Untitled",
      posterUrl: typeof record.posterUrl === "string" ? record.posterUrl : null,
      year: typeof record.year === "number" && Number.isFinite(record.year) ? record.year : null,
      format: typeof record.format === "string" && record.format ? record.format : null,
    };
  } catch {
    return null;
  }
}

/** Preserve the title a guest tried to save (replaces any older intent). */
export function savePendingWatchlistIntent(intent: WatchlistEntryInput): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Unavailable storage must never break the login redirect itself.
  }
}

/** Read (and stop keeping) the pending intent; returns null when none. */
export function consumePendingWatchlistIntent(): WatchlistEntryInput | null {
  if (!isBrowser()) return null;
  let intent: WatchlistEntryInput | null = null;
  try {
    intent = parseIntent(window.sessionStorage.getItem(INTENT_KEY));
  } catch {
    intent = null;
  }
  clearPendingWatchlistIntent();
  return intent;
}

/** Drop the intent without consuming (logout, tab cleanup). */
export function clearPendingWatchlistIntent(): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // Already impossible to read — nothing to do.
  }
}
