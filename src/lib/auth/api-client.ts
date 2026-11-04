/**
 * Browser-side client for the OFFANIME auth endpoints.
 *
 * Everything goes through the SAME-ORIGIN restricted proxy
 * (`src/app/api/[...path]/route.ts`), which injects the server-side API key
 * and forwards cookies. The browser therefore never sees the API secret or
 * tokens, and HttpOnly session cookies set upstream are first-class.
 *
 * HARD RULES (PART 10):
 *   - Credentials and tokens are only ever placed in request bodies /
 *     headers. They are never logged, never written to localStorage or
 *     sessionStorage, and never put in URLs.
 *   - Session persistence relies on the backend's HttpOnly cookies
 *     (`offanime_session`, `offanime_refresh`) — never on client storage.
 *   - The one-time tokens from recovery links are exchanged immediately and
 *     the memory is released at the end of the call.
 *
 * Requests always target RELATIVE paths (`/api/auth/…`) so the client works
 * on any deployment without hardcoded URLs.
 */

import {
  AuthApiError,
  type AuthErrorCode,
  type AuthSessionResponse,
  type AuthSessionTokens,
  type AuthUser,
} from "./types";

/** Matches the proxy's own upstream budget (15s); keep bounded, never longer. */
const AUTH_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize any transport/HTTP failure into an `AuthApiError`. Never echoes
 * bodies or credentials.
 */
function normalizeFailure(response: Response | null, parsed: unknown): AuthApiError {
  let code: AuthErrorCode = "NETWORK_ERROR";
  let message = "Authentication request failed.";
  let retryAfterMs: number | undefined;

  if (response) {
    const envelope = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null;
    const rawCode = typeof envelope?.code === "string" ? envelope.code : "";
    const rawMessage = typeof envelope?.message === "string" ? envelope.message : "";
    const details = isRecord(envelope?.details) ? envelope.details : null;
    const retryHint = details?.retryAfterMs;
    retryAfterMs =
      typeof retryHint === "number" && Number.isFinite(retryHint) && retryHint > 0
        ? retryHint
        : undefined;

    code = (rawCode || (response.status >= 500 ? "INTERNAL_ERROR" : "NETWORK_ERROR")) as AuthErrorCode;
    message = rawMessage || message;
  }

  return new AuthApiError({ code, message, status: response?.status, retryAfterMs });
}

/**
 * Perform one auth call. Returns the parsed payload, or null when the body
 * could not be parsed. Failures DO NOT throw here — the endpoint wrappers
 * inspect `ok` and build failures, so callers always get typed results.
 * Exported for the isolated future-resend seam (resend-future.ts).
 */
export async function authRequest(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown>; bearer?: string },
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: AuthApiError }
> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  // Bearer is only used where the documented token flow requires it (the
  // password-update fallback after a recovery-token exchange). It is NEVER
  // needed for logins — cookies already carry the session.
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;

  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, {
      method: init.method,
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      cache: "no-store",
      // Same-origin fetch includes the HttpOnly session cookies automatically.
      credentials: "same-origin",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return {
        ok: false,
        error: new AuthApiError({ code: "TIMEOUT_ERROR", message: "The request took too long." }),
      };
    }
    return {
      ok: false,
      error: new AuthApiError({ code: "NETWORK_ERROR", message: "Network request failed." }),
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    return { ok: false, error: normalizeFailure(response, parsed) };
  }
  return { ok: true, data: parsed };
}

// --- payload coercion ------------------------------------------------------------

function coerceUser(value: unknown): AuthUser {
  const raw = isRecord(value) ? value : {};
  return {
    id: typeof raw.id === "string" ? raw.id : "",
    email: typeof raw.email === "string" ? raw.email : "",
    emailConfirmedAt: typeof raw.emailConfirmedAt === "string" ? raw.emailConfirmedAt : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : null,
    lastSignInAt: typeof raw.lastSignInAt === "string" ? raw.lastSignInAt : null,
    displayName:
      typeof raw.displayName === "string" && raw.displayName.trim() ? raw.displayName.trim() : "",
  };
}

/**
 * Coerce a session-bearing response `{ user, session | null, ... }`.
 * Tokens are read ONLY for immediate, documented uses — the coercer never
 * persists them.
 */
function coerceSessionResponse(value: unknown): AuthSessionResponse {
  const raw = isRecord(value) ? value : {};
  const sessionRaw = isRecord(raw.session) ? raw.session : null;
  const accessToken = typeof sessionRaw?.accessToken === "string" ? sessionRaw.accessToken : "";
  const refreshToken =
    typeof sessionRaw?.refreshToken === "string" ? sessionRaw.refreshToken : "";
  const expiresIn =
    typeof sessionRaw?.expiresIn === "number" && Number.isFinite(sessionRaw.expiresIn)
      ? sessionRaw.expiresIn
      : 3600;
  const expiresAt = typeof sessionRaw?.expiresAt === "string" ? sessionRaw.expiresAt : "";

  return {
    user: coerceUser(raw.user),
    session:
      accessToken && refreshToken
        ? {
            accessToken,
            refreshToken,
            tokenType: "bearer",
            expiresIn,
            expiresAt,
          }
        : null,
    emailConfirmationRequired: raw.emailConfirmationRequired === true,
  };
}

// --- endpoint wrappers -----------------------------------------------------------

export interface AuthEndpointFailure {
  kind: "error";
  error: AuthApiError;
}

export type AuthUserResult =
  | { kind: "user"; user: AuthUser }
  /**
   * The provider issued NO session for this account — its confirm-email
   * setting is ON upstream (operator configuration; see
   * docs/auth/SUPABASE_SETUP.md). OFFANIME has no verification workflow
   * (product decision): the UI states the outcome honestly and offers the
   * normal sign-in — it never claims the visitor is logged in.
   */
  | { kind: "session-not-issued"; user: AuthUser }
  | AuthEndpointFailure;

/**
 * POST /api/auth/signup — creates the account. Returns the verified user
 * straight from the response (no extra `/me` roundtrip). With the operator's
 * "confirm email" setting ON, the backend answers 201 with a user but
 * `{ session: null }` — that outcome is surfaced as `session-not-issued`
 * (honest, never faked) and NOT as a logged-in state. When the setting is
 * OFF (the intended OFFANIME configuration), session is non-null and signup
 * IS an immediate sign-in.
 */
export async function signup({ email, password }: { email: string; password: string }): Promise<AuthUserResult> {
  const result = await authRequest("signup", { method: "POST", body: { email, password } });
  if (!result.ok) return { kind: "error", error: result.error };
  const session = coerceSessionResponse(result.data);
  if (!session.user.email) {
    return {
      kind: "error",
      error: new AuthApiError({ code: "AUTH_PROVIDER_ERROR", message: "Signup response was incomplete." }),
    };
  }
  return session.session === null
    ? { kind: "session-not-issued", user: session.user }
    : { kind: "user", user: session.user };
}

/**
 * POST /api/auth/login — password grant. Session cookies are set upstream on
 * success; the AuthProvider adopts `user` from the body directly. An
 * upstream that still requires email confirmation replies with a user but
 * `{ session: null }` — surfaced honestly as `session-not-issued` (the
 * account exists; no session was created; no verification UI exists).
 */
export async function login({ email, password }: { email: string; password: string }): Promise<AuthUserResult> {
  const result = await authRequest("login", { method: "POST", body: { email, password } });
  if (!result.ok) return { kind: "error", error: result.error };
  const session = coerceSessionResponse(result.data);
  if (!session.user.email) {
    return {
      kind: "error",
      error: new AuthApiError({ code: "AUTH_PROVIDER_ERROR", message: "Login response was incomplete." }),
    };
  }
  return session.session === null
    ? { kind: "session-not-issued", user: session.user }
    : { kind: "user", user: session.user };
}

/**
 * POST /api/auth/logout — revokes the session upstream and clears cookies.
 * `session-already-gone` (401/404) is treated as success (idempotent UX);
 * hard failures (upstream down/timeouts) are surfaced so the UI does NOT
 * claim success it cannot guarantee.
 */
export async function logout(): Promise<
  { kind: "logged-out" } | { kind: "session-already-gone" } | AuthEndpointFailure
> {
  const result = await authRequest("logout", { method: "POST" });
  if (result.ok) return { kind: "logged-out" };
  if (
    result.error.status === 401 ||
    result.error.status === 404 ||
    result.error.code === "AUTH_SESSION_EXPIRED" ||
    result.error.code === "UNAUTHORIZED_ERROR"
  ) {
    return { kind: "session-already-gone" };
  }
  return { kind: "error", error: result.error };
}

/**
 * GET /api/auth/me — verifies the presented session upstream. Used for
 * restore-on-mount and manual refreshes; never called per interaction.
 */
export async function fetchCurrentUser(): Promise<
  | { kind: "user"; user: AuthUser }
  | { kind: "session-expired" }
  | { kind: "unavailable" }
  | AuthEndpointFailure
> {
  const result = await authRequest("me", { method: "GET" });
  if (result.ok) {
    const raw = isRecord(result.data) ? result.data : {};
    return { kind: "user", user: coerceUser(raw.user) };
  }
  const { code } = result.error;
  if (code === "AUTH_SESSION_EXPIRED") return { kind: "session-expired" };
  if (
    code === "PROXY_NOT_CONFIGURED" ||
    code === "UPSTREAM_UNAVAILABLE" ||
    code === "AUTH_PROVIDER_ERROR" ||
    code === "TIMEOUT_ERROR" ||
    code === "NETWORK_ERROR" ||
    code === "INTERNAL_ERROR"
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "error", error: result.error };
}

/**
 * POST /api/auth/refresh — rotates the session using the HttpOnly refresh
 * cookie (`Path=/api/auth`). The proxy path matches, so no tokens are handled
 * in the browser. Backend contract: refresh exactly once per 401, then log
 * out (backend.md §6).
 */
export async function refreshSession(): Promise<
  { kind: "refreshed"; user: AuthUser } | { kind: "session-gone" } | AuthEndpointFailure
> {
  const result = await authRequest("refresh", { method: "POST" });
  if (result.ok) {
    return { kind: "refreshed", user: coerceSessionResponse(result.data).user };
  }
  const { code } = result.error;
  if (
    code === "AUTH_SESSION_EXPIRED" ||
    code === "VALIDATION_ERROR" || // "A refresh token is required" — no cookie, provider disabled
    code === "UNAUTHORIZED_ERROR"
  ) {
    return { kind: "session-gone" };
  }
  return { kind: "error", error: result.error };
}

/**
 * POST /api/auth/password-reset — uniform response (the backend never
 * reveals whether an address exists). The UI MUST NOT interpret anything
 * beyond `ok` — anti-enumeration.
 */
export async function requestPasswordResetEmail({ email }: { email: string }): Promise<
  { kind: "sent" } | AuthEndpointFailure
> {
  const result = await authRequest("password-reset", { method: "POST", body: { email } });
  if (result.ok) return { kind: "sent" };
  return { kind: "error", error: result.error };
}

/**
 * POST /api/auth/verify — exchanges the ONE-TIME token from a recovery
 * email link for a session. The backend accepts either a `tokenHash`
 * (hashed link tokens — the recommended Supabase dashboard template) or a
 * raw one-time `token`. The issued session is used immediately for
 * password-update (cookies are set upstream by this response). The tokens
 * also travel in the response body per the documented universal flow —
 * they were held in MEMORY only for the password-update fallback.
 */
export type AuthVerifyResult =
  | { kind: "user"; user: AuthUser; sessionTokens: AuthSessionTokens | null }
  | AuthEndpointFailure;

/**
 * POST /api/auth/verify — exchanges the ONE-TIME token from a recovery
 * email link for a session. The backend accepts either a `tokenHash`
 * (hashed link tokens — the recommended Supabase dashboard template) or a
 * raw one-time `token`. The issued session is used immediately for
 * password-update (cookies are set upstream by this response). The tokens
 * also travel in the response body per the documented universal flow —
 * they were held in MEMORY only for the password-update fallback.
 *
 * OFFANIME has no signup-token verification flow (NO email verification,
 * product decision): a verify call must establish the session needed by the
 * next step. When the upstream issues no session (e.g. its confirm-email
 * setting is ON), that is an honest provider failure — nothing verification-
 * shaped is invented.
 */
export async function exchangeRecoveryToken(params: {
  tokenHash?: string;
  token?: string;
}): Promise<AuthVerifyResult> {
  const body: Record<string, unknown> = { type: "recovery" };
  if (params.tokenHash) body.tokenHash = params.tokenHash;
  else if (params.token) body.token = params.token;
  const result = await authRequest("verify", { method: "POST", body });
  if (!result.ok) return { kind: "error", error: result.error };
  return toVerifyResult(result.data);
}

function toVerifyResult(data: unknown): AuthVerifyResult {
  const session = coerceSessionResponse(data);
  if (!session.user.email || session.session === null) {
    // A recovery verify MUST establish the session the next step
    // (password-update) runs on. A user without a session is an honest
    // upstream failure, not a verification state to present.
    return {
      kind: "error",
      error: new AuthApiError({
        code: "AUTH_PROVIDER_ERROR",
        message: "Verification did not establish a session.",
      }),
    };
  }
  return { kind: "user", user: session.user, sessionTokens: session.session };
}

/**
 * POST /api/auth/password-update — sets a new password for the CURRENT
 * session. Primary mechanism: the session cookie just established by the
 * recovery-token exchange. Fallback (only when the upstream deployment does
 * not issue cookies): one in-memory Bearer attempt with the token returned
 * by the verify call — held for milliseconds, never stored or logged.
 */
export async function updatePassword(params: {
  password: string;
  /** Fallback token from exchangeRecoveryToken — optional, in-memory only. */
  bearer?: string;
}): Promise<
  | { kind: "updated"; user: AuthUser }
  | { kind: "no-session" }
  | AuthEndpointFailure
> {
  const attempt = await authRequest("password-update", {
    method: "POST",
    body: { password: params.password },
    ...(params.bearer ? { bearer: params.bearer } : {}),
  });
  if (attempt.ok) {
    const raw = isRecord(attempt.data) ? attempt.data : {};
    return { kind: "updated", user: coerceUser(raw.user) };
  }
  const { code } = attempt.error;
  if (
    code === "AUTH_SESSION_EXPIRED" ||
    code === "UNAUTHORIZED_ERROR" ||
    code === "VALIDATION_ERROR"
  ) {
    return { kind: "no-session" };
  }
  return { kind: "error", error: attempt.error };
}
