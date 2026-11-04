/**
 * Watchlist domain types. The watchlist is ACCOUNT-BACKED: entries live in
 * the backend (keyed by the signed-in user via RLS) and nothing here is ever
 * persisted to localStorage — the browser holds only the React state cache
 * for the current session, fed by `watchlist/api-client.ts`.
 *
 * Backend contract (REAL endpoints, verified from src/routes/
 * watchlist.routes.js + src/controllers/watchlist.controller.js): only the
 * ANILIST ID and the server-side `added_at` timestamp are stored — display
 * metadata is intentionally NOT duplicated upstream, so the UI hydrates it
 * through the existing `/details/:id` endpoint.
 */

/** One saved title as the backend returns it (animeId = the AniList ID). */
export interface WatchlistEntry {
  animeId: number;
  /** ISO timestamp when the entry was saved (server clock; newest first). */
  addedAt: string;
  /**
   * Optional display metadata. Present for entries saved during the current
   * session / completed guest intents; entries loaded fresh from the backend
   * carry none until the card hydrates them from `/details/:id`.
   */
  title?: string;
  posterUrl?: string | null;
  year?: number | null;
  format?: string | null;
}

/** Metadata-rich save payload: identity + display metadata for instant UI. */
export interface WatchlistEntryMeta {
  title: string;
  posterUrl: string | null;
  year: number | null;
  format: string | null;
}

/** What UI components hand to the store when saving (stored locally only —
 *  the backend receives { animeId } alone). */
export type WatchlistEntryInput = WatchlistEntryMeta & { animeId: number };

/**
 * Why a persist/list attempt failed. `session-expired` survives the
 * documented refresh-once-then-retry (the retry already happened inside the
 * client).
 */
export type WatchlistFailureReason =
  | "session-expired"
  | "unavailable"
  | "rate-limited"
  | "error";

/** High-level store status surfaced to pages. */
export type WatchlistStatus =
  | "idle" // no signed-in user (guest) — nothing to show
  | "loading" // list fetch in flight for the current user
  | "ready" // user list resolved (may be empty)
  | "unavailable" // list endpoint unreachable (upstream down / not deployed)
  | "expired"; // the fetch needed a session that no longer verifies
