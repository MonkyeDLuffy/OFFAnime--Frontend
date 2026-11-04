/**
 * Continue-watching domain types. Continue watching is ACCOUNT-BACKED: entries
 * live in the backend (keyed by the signed-in user via RLS) and nothing here
 * is ever persisted to localStorage — the browser holds only the React state
 * cache for the current session.
 *
 * Backend contract (REAL endpoints, implemented in the backend repo):
 *   GET    /api/user/continue-watching
 *          -> { items: [{ anilistId, episode, progress?, updatedAt }], count }
 *             (newest watched first)
 *   POST   /api/user/continue-watching
 *          body { anilistId, episode, progress? }
 *          -> 200 { ok: true, anilistId, episode, updatedAt }
 *   DELETE /api/user/continue-watching/:anilistId
 *          -> 200 { ok: true, anilistId }
 *
 * Only identity + episode + optional progress are stored upstream. Display
 * metadata (title, artwork, episode title) is intentionally NOT duplicated
 * upstream - the UI hydrates it through the existing anime/episode endpoints.
 */

/** One continue-watching entry as the backend returns it. */
export interface ContinueWatchingEntry {
  /** AniList ID - the canonical anime identity. */
  anilistId: number;
  /** Global episode number (continuous across seasons). */
  episode: number;
  /** Optional progress percentage (0-100); null when not reported. */
  progress: number | null;
  /** ISO timestamp when the entry was last saved (server clock; newest first). */
  updatedAt: string;
  /**
   * Optional display metadata hydrated from `/api/details/:id` and
   * `/api/episodes/:id`. Present for entries enriched during the current
   * session; entries loaded fresh from the backend carry none until hydrated.
   */
  title?: string;
  episodeTitle?: string;
  posterUrl?: string | null;
  episodeThumbnail?: string | null;
  year?: number | null;
  format?: string | null;
  /** Client-side hydration state for the card UI. Never sent upstream:
   * `loading` while `/details` + `/episodes` are in flight, `ready` once
   * resolved (possibly with no artwork → caller falls back), `failed` when
   * the request rejected (transport failure). */
  metaStatus?: "loading" | "ready" | "failed";
}

/** What UI components hand to the store when saving (the backend receives
 *  { anilistId, episode, progress? } alone). */
export type ContinueWatchingEntryInput = {
  anilistId: number;
  episode: number;
  progress?: number;
  title?: string;
  posterUrl?: string | null;
  episodeTitle?: string;
  episodeThumbnail?: string | null;
  year?: number | null;
  format?: string | null;
};

/** Why a persist/list attempt failed. `session-expired` survives the
 *  documented refresh-once-then-retry (the retry already happened inside the
 *  client). */
export type ContinueWatchingFailureReason =
  | "session-expired"
  | "unavailable"
  | "rate-limited"
  | "error";

/** High-level store status surfaced to pages. */
export type ContinueWatchingStatus =
  | "idle" // no signed-in user (guest) — nothing to show
  | "loading" // list fetch in flight for the current user
  | "ready" // user list resolved (may be empty)
  | "unavailable" // list endpoint unreachable (upstream down / not deployed)
  | "expired" // the fetch needed a session that no longer verifies
  | "error"; // a non-session list error
