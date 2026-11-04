/**
 * Browser-side client for the ACCOUNT-BACKED continue-watching list.
 *
 * Everything goes through the SAME-ORIGIN proxy
 * (`src/app/api/[...path]/route.ts`), which forwards the HttpOnly session
 * cookies and injects the server-side API key — identical transport to the
 * auth and watchlist clients. Requests always use relative paths.
 *
 * Upstream contract (IMPLEMENTED — verified from
 * src/routes/continue-watching.routes.js and
 * src/controllers/continue-watching.controller.js):
 *
 *   GET    /api/user/continue-watching
 *          -> 200 { items: [{ anilistId, episode, progress?, updatedAt }],
 *                 count }
 *   POST   /api/user/continue-watching
 *          body { anilistId, episode, progress? }
 *          -> 200 { ok: true, anilistId, episode, updatedAt }   (upsert)
 *   DELETE /api/user/continue-watching/:anilistId
 *          -> 200 { ok: true, anilistId }
 *
 * Only `{ anilistId, episode, progress? }` is ever sent — the backend derives
 * the user id solely from the verified session (RLS), and metadata is never
 * stored upstream. Errors use the backend envelope
 * `{ error: { code, message } }`.
 *
 * Tokens/cookies are never logged, never stored — same hard rules as auth.
 */

import type {
  ContinueWatchingEntry,
  ContinueWatchingFailureReason,
} from "./types";

/** Bounded like every other client call (proxy budget is 15s). */
const CONTINUE_WATCHING_TIMEOUT_MS = 12_000;

/** Real backend continue-watching paths. */
const CW_PATH = "user/continue-watching";

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
      signal: AbortSignal.timeout(CONTINUE_WATCHING_TIMEOUT_MS),
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
function classify(outcome: AttemptOutcome): { ok: true } | { ok: false; reason: ContinueWatchingFailureReason } {
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

/** Coerce one raw continue-watching item from the backend. */
function coerceEntry(value: unknown): ContinueWatchingEntry | null {
  if (!isRecord(value)) return null;
  const anilistId =
    typeof value.anilistId === "number" && Number.isInteger(value.anilistId) && value.anilistId > 0
      ? value.anilistId
      : null;
  if (anilistId === null) return null;
  const episode =
    typeof value.episode === "number" && Number.isInteger(value.episode) && value.episode > 0
      ? value.episode
      : null;
  if (episode === null) return null;
  const progress =
    typeof value.progress === "number" && Number.isInteger(value.progress) && value.progress >= 0 && value.progress <= 100
      ? value.progress
      : null;
  const updatedAt = typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : "";
  return { anilistId, episode, progress, updatedAt };
}

/**
 * GET /api/user/continue-watching — the user's watching history, newest
 * watched first. Performs the refresh-once-then-retry itself so callers never
 * juggle session mechanics.
 */
export async function listContinueWatching(): Promise<
  | { kind: "items"; items: ContinueWatchingEntry[] }
  | { kind: "failure"; reason: ContinueWatchingFailureReason }
> {
  let outcome = await attempt("GET", CW_PATH);
  if (!outcome.ok && (outcome.code === "AUTH_SESSION_EXPIRED" || outcome.status === 401)) {
    const { refreshSession } = await import("@/lib/auth/api-client");
    await refreshSession();
    outcome = await attempt("GET", CW_PATH);
  }

  if (outcome.ok) {
    const raw = isRecord(outcome.data) ? outcome.data : {};
    const list = Array.isArray(raw.items) ? raw.items : [];
    const items: ContinueWatchingEntry[] = [];
    const seen = new Set<number>();
    for (const candidate of list) {
      const entry = coerceEntry(candidate);
      // Duplicate prevention starts at the payload boundary (uniqueness is
      // also enforced server-side by the (user_id, anilist_id) primary key).
      if (entry && entry.updatedAt && !seen.has(entry.anilistId)) {
        seen.add(entry.anilistId);
        items.push(entry);
      }
    }
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { kind: "items", items };
  }
  const verdict = classify(outcome);
  return { kind: "failure", reason: verdict.ok ? "unavailable" : verdict.reason };
}

/**
 * POST /api/user/continue-watching — upsert watching progress, body
 * `{ anilistId, episode, progress? }` ONLY (idempotent upstream).
 * Refresh-once-then-retry mirrors the GET behavior.
 */
export async function upsertContinueWatching(
  entry: { anilistId: number; episode: number; progress?: number },
): Promise<{ ok: true; updatedAt: string | null } | { ok: false; reason: ContinueWatchingFailureReason }> {
  let outcome = await attempt("POST", CW_PATH, {
    anilistId: entry.anilistId,
    episode: entry.episode,
    ...(entry.progress !== undefined ? { progress: entry.progress } : {}),
  });
  if (!outcome.ok && (outcome.code === "AUTH_SESSION_EXPIRED" || outcome.status === 401)) {
    const { refreshSession } = await import("@/lib/auth/api-client");
    await refreshSession();
    outcome = await attempt("POST", CW_PATH, {
      anilistId: entry.anilistId,
      episode: entry.episode,
      ...(entry.progress !== undefined ? { progress: entry.progress } : {}),
    });
  }
  if (!outcome.ok) {
    const verdict = classify(outcome);
    return verdict.ok ? { ok: false, reason: "unavailable" } : verdict;
  }
  const payload = isRecord(outcome.data) ? outcome.data : {};
  const updatedAt = typeof payload.updatedAt === "string" && payload.updatedAt ? payload.updatedAt : null;
  return { ok: true, updatedAt };
}

/**
 * DELETE /api/user/continue-watching/:anilistId — persist one removal.
 * Under the real contract an absent id is STILL a 200 { ok: true }
 * (idempotent), so any upstream 404 means the route itself is unreachable →
 * honest failure. Refresh-once-then-retry applies.
 */
export async function removeContinueWatching(
  anilistId: number,
): Promise<{ ok: true } | { ok: false; reason: ContinueWatchingFailureReason }> {
  const path = `${CW_PATH}/${anilistId}`;
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
