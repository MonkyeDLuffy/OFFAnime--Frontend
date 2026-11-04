/**
 * Browser-side client for the ACCOUNT-BACKED watchlist.
 *
 * Everything goes through the SAME-ORIGIN proxy
 * (`src/app/api/[...path]/route.ts`), which forwards the HttpOnly session
 * cookies and injects the server-side API key — identical transport to the
 * auth client. Requests always use relative paths.
 *
 * Upstream contract (IMPLEMENTED — verified from src/routes/watchlist.routes.js
 * and src/controllers/watchlist.controller.js; see docs/watchlist/
 * BACKEND_CONTRACT.md):
 *
 *   GET    /api/watchlist            → 200 { items: [{ animeId, addedAt }], count }
 *   POST   /api/watchlist            → 201 { added: true,  animeId, addedAt }
 *                                    → 200 { added: false, animeId, addedAt: null }
 *   DELETE /api/watchlist/:animeId   → 200 { ok: true, animeId }
 *
 * Only `{ animeId }` is ever sent — the backend derives the user id solely
 * from the verified session (RLS), and metadata is never stored upstream.
 * Errors use the backend envelope `{ error: { code, message } }`.
 *
 * Tokens/cookies are never logged, never stored — same hard rules as auth.
 */

import type { WatchlistEntry, WatchlistEntryInput, WatchlistFailureReason } from "./types";

/** Bounded like every other client call (proxy budget is 15s). */
const WATCHLIST_TIMEOUT_MS = 12_000;

/** Real backend watchlist paths (backend.md §watchlist). */
const WATCHLIST_PATH = "watchlist";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Error codes the backend error envelope can carry for these calls. */
type BackendCode =
  | "UNAUTHORIZED_ERROR"
  | "AUTH_SESSION_EXPIRED"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "NOT_FOUND"
  | "FORBIDDEN_ERROR"
  | string; // envelope passes codes through unchanged (proxy passthrough)

interface AttemptOutcome {
  ok: boolean;
  status: number;
  code: BackendCode | null;
  data: unknown;
}

async function attempt(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<AttemptOutcome> {
  try {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      // Same-origin fetch includes the HttpOnly session cookies automatically.
      credentials: "same-origin",
      signal: AbortSignal.timeout(WATCHLIST_TIMEOUT_MS),
    });
    let parsed: unknown = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    const envelope = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
    const code = envelope && typeof envelope.code === "string" ? envelope.code : null;
    return { ok: response.ok, status: response.status, code, data: parsed };
  } catch (error) {
    // No response at all (network/timeout) — upstream unusable for now.
    const timedOut = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return { ok: false, status: timedOut ? 504 : 0, code: null, data: null };
  }
}

/**
 * Map one attempt (with refresh-once-then-retry on dead sessions) to the
 * typed outcome. Mirrors the documented auth recovery rule (backend.md §6):
 * on `AUTH_SESSION_EXPIRED` refresh EXACTLY once and retry, then give up.
 *
 * Failure classes stay DISTINCT (each reason has its own UI copy):
 *   - 401 family               → session-expired (auth problem, not storage)
 *   - 429                      → rate-limited
 *   - 502/504/provider/network → unavailable (storage/provider unreachable)
 *   - 400/403/404/500          → error (validation, CSRF/authorization,
 *                                missing route/resource, internal backend)
 */
function classify(outcome: AttemptOutcome): { ok: true } | { ok: false; reason: WatchlistFailureReason } {
  if (outcome.ok) return { ok: true };
  if (
    outcome.code === "UNAUTHORIZED_ERROR" ||
    outcome.code === "AUTH_SESSION_EXPIRED" ||
    outcome.status === 401
  ) {
    return { ok: false, reason: "session-expired" };
  }
  if (outcome.code === "RATE_LIMIT_ERROR" || outcome.status === 429) {
    return { ok: false, reason: "rate-limited" };
  }
  if (
    outcome.code === "PROVIDER_ERROR" ||
    outcome.code === "UPSTREAM_UNAVAILABLE" ||
    outcome.code === "TIMEOUT_ERROR" ||
    outcome.status === 502 ||
    outcome.status === 504 ||
    outcome.status === 0 // no response at all (network/timeout)
  ) {
    return { ok: false, reason: "unavailable" };
  }
  // VALIDATION_ERROR (400), FORBIDDEN (403: CSRF/RLS/authorization),
  // NOT_FOUND (404: route/resource missing), INTERNAL_ERROR (500) and any
  // other code — a real error, NOT a storage-reachability problem.
  return { ok: false, reason: "error" };
}

/** Coerce one raw watchlist item from the backend's `{ animeId, addedAt }`. */
function coerceEntry(value: unknown): WatchlistEntry | null {
  if (!isRecord(value)) return null;
  const animeId =
    typeof value.animeId === "number" && Number.isInteger(value.animeId) && value.animeId > 0
      ? value.animeId
      : null;
  if (animeId === null) return null;
  const addedAt = typeof value.addedAt === "string" && value.addedAt ? value.addedAt : "";
  // Display metadata is never sent by the backend; tolerate it defensively
  // (forward-compat) but never treat it as authoritative here.
  const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : undefined;
  const year = typeof value.year === "number" && Number.isFinite(value.year) ? value.year : undefined;
  const format = typeof value.format === "string" && value.format ? value.format : undefined;
  const posterUrl = typeof value.posterUrl === "string" ? value.posterUrl : undefined;
  return { animeId, addedAt, title, year, format, posterUrl };
}

/**
 * GET /api/watchlist — the user's saved titles (newest first).
 * Performs the refresh-once-then-retry itself so callers never juggle
 * session mechanics.
 */
export async function listWatchlist(): Promise<
  { kind: "items"; items: WatchlistEntry[] } | { kind: "failure"; reason: WatchlistFailureReason }
> {
  let outcome = await attempt("GET", WATCHLIST_PATH);
  if (!outcome.ok && (outcome.code === "AUTH_SESSION_EXPIRED" || outcome.status === 401)) {
    const { refreshSession } = await import("@/lib/auth/api-client");
    await refreshSession();
    outcome = await attempt("GET", WATCHLIST_PATH);
  }

  if (outcome.ok) {
    const raw = isRecord(outcome.data) ? outcome.data : {};
    const list = Array.isArray(raw.items) ? raw.items : [];
    const items: WatchlistEntry[] = [];
    const seen = new Set<number>();
    for (const candidate of list) {
      const entry = coerceEntry(candidate);
      // Duplicate prevention starts at the payload boundary (uniqueness is
      // also enforced server-side by the (user_id, anime_id) primary key).
      if (entry && entry.addedAt && !seen.has(entry.animeId)) {
        seen.add(entry.animeId);
        items.push(entry);
      }
    }
    items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    return { kind: "items", items };
  }
  // outcome.ok is false here by construction of the branch — the classifier
  // must yield a failure verdict.
  const verdict = classify(outcome);
  return { kind: "failure", reason: verdict.ok ? "unavailable" : verdict.reason };
}

/**
 * POST /api/watchlist — persist one addition, body `{ animeId }` ONLY
 * (idempotent upstream: an already-saved id responds 200 { added: false }).
 * Refresh-once-then-retry mirrors the GET behavior. Success carries the
 * server's `addedAt` (201 first add) when the backend returned one.
 */
export async function addWatchlistEntry(
  entry: WatchlistEntryInput,
): Promise<{ ok: true; addedAt: string | null } | { ok: false; reason: WatchlistFailureReason }> {
  let outcome = await attempt("POST", WATCHLIST_PATH, { animeId: entry.animeId });
  if (!outcome.ok && (outcome.code === "AUTH_SESSION_EXPIRED" || outcome.status === 401)) {
    const { refreshSession } = await import("@/lib/auth/api-client");
    await refreshSession();
    outcome = await attempt("POST", WATCHLIST_PATH, { animeId: entry.animeId });
  }
  if (!outcome.ok) {
    const verdict = classify(outcome);
    return verdict.ok ? { ok: false, reason: "unavailable" } : verdict;
  }
  // 200/201 → parse { added, addedAt }; a first add (added: true) returns the
  // authoritative server timestamp, an idempotent repeat (added: false)
  // returns addedAt: null (the caller keeps its existing entry untouched).
  const payload = isRecord(outcome.data) ? outcome.data : {};
  const addedAt = typeof payload.addedAt === "string" && payload.addedAt ? payload.addedAt : null;
  return { ok: true, addedAt: payload.added === true ? addedAt : null };
}

/**
 * DELETE /api/watchlist/:animeId — persist one removal. Under the real
 * contract an absent id is STILL a 200 { ok: true } (idempotent), so any
 * upstream 404 means the route itself is unreachable → honest failure.
 * Refresh-once-then-retry applies.
 */
export async function removeWatchlistEntry(
  animeId: number,
): Promise<{ ok: true } | { ok: false; reason: WatchlistFailureReason }> {
  const path = `${WATCHLIST_PATH}/${animeId}`;
  let outcome = await attempt("DELETE", path);
  if (!outcome.ok && (outcome.code === "AUTH_SESSION_EXPIRED" || outcome.status === 401)) {
    const { refreshSession } = await import("@/lib/auth/api-client");
    await refreshSession();
    outcome = await attempt("DELETE", path);
  }
  if (outcome.ok) return { ok: true };
  const verdict = classify(outcome);
  return verdict.ok ? { ok: false, reason: "unavailable" } : verdict;
}
