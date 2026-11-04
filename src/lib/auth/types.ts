/**
 * Shared auth types for the OFFANIME frontend (backend.md §6/§7 + live probes
 * against `offanime-backend-v1`). Shapes mirror the backend's *actual* Supabase
 * Auth (GoTrue) contracts — nothing here invents behavior:
 *
 *   POST /api/auth/signup            201 { user, session | null, emailConfirmationRequired? }
 *   POST /api/auth/login             200 { user, session | null, emailConfirmationRequired? }
 *   POST /api/auth/logout            200 { ok: true }   (revoices upstream + clears cookies)
 *   GET  /api/auth/me                200 { user }       (session required, verified upstream)
 *   POST /api/auth/refresh           200 { user, session }  (rotates the session)
 *   POST /api/auth/password-reset    200 { ok: true }   (uniform — no user enumeration)
 *   POST /api/auth/verify            200 { user, session | null }  (one-time link token → session)
 *   POST /api/auth/password-update   200 { user }       (session required)
 *   POST /api/auth/resend            (future — deliberately NOT wired; see resend-future.ts)
 *
 * Session flow: tokens arrive in the RESPONSE BODY and are ALSO set as
 * HttpOnly cookies (`offanime_session` Path=/, `offanime_refresh`
 * Path=/api/auth — backend constants). This frontend NEVER persists tokens in
 * browser storage: persistence = the HttpOnly cookies, and every session-
 * required call goes through the same-origin `/api/auth/*` proxy, which
 * forwards cookies and injects the server-side API key.
 */

/** Safe, public user representation returned by every auth endpoint. */
export interface AuthUser {
  id: string;
  email: string;
  emailConfirmedAt: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  /** From Supabase `user_metadata.name` / `display_name`. Currently null for
   *  new signups — the backend signup contract accepts no display-name field. */
  displayName: string;
}

/**
 * Token bundle returned by signup/login/refresh/verify responses. Treated as
 * "use immediately or discard" — never written to storage (cookies carry the
 * session). Only tiny in-memory lifetimes are allowed as a fallback for
 * password-update (see api-client.ts).
 */
export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "bearer";
  /** Seconds until the access token expires (e.g. 3600). */
  expiresIn: number;
  /** Absolute expiry, ISO timestamp (backend normalization of epoch). */
  expiresAt: string;
}

/**
 * Body of signup/login/refresh/verify. `emailConfirmationRequired` is present
 * only when the auth provider issues no session (its "confirm email" setting).
 */
export interface AuthSessionResponse {
  user: AuthUser;
  session: AuthSessionTokens | null;
  emailConfirmationRequired?: boolean;
}

/** `POST /api/auth/logout` body. */
export interface AuthLogoutResponse {
  ok: true;
}

/** `POST /api/auth/password-reset` / (future) `/resend` body. */
export interface AuthOkResponse {
  ok: true;
}

/** `POST /api/auth/password-update` body. */
export interface AuthPasswordUpdateResponse {
  user: AuthUser;
}

/**
 * Error codes the backend can return on `/api/auth/*` (backend.md §7 + live
 * probes), including the proxy's own codes for transport problems.
 */
export type AuthErrorCode =
  | "VALIDATION_ERROR" // 400  (bad email/password/format — controller validates before upstream)
  | "UNAUTHORIZED_ERROR" // 401  (no session at all, e.g. /logout / /me without a token)
  | "AUTH_INVALID_CREDENTIALS" // 401  (login rejected upstream)
  | "AUTH_SESSION_EXPIRED" // 401  (presented token rejected: expired/revoked/malformed; also recovery links)
  | "FORBIDDEN_ERROR" // 403  (CSRF/origin rejection or signups disabled upstream)
  | "AUTH_EMAIL_NOT_CONFIRMED" // 403  (provider requires email confirmation)
  | "AUTH_EMAIL_TAKEN" // 409  (duplicate registration)
  | "RATE_LIMIT_ERROR" // 429  (upstream throttling; may carry retryAfterMs)
  | "NOT_FOUND" // 404
  | "NOT_IMPLEMENTED" // 501
  | "AUTH_PROVIDER_ERROR" // 502  (GoTrue unreachable/unexpected, or missing_configuration)
  | "UPSTREAM_UNAVAILABLE" // 502  (proxy: backend unreachable)
  | "PROXY_NOT_CONFIGURED" // 500  (proxy env missing)
  | "INTERNAL_ERROR" // 500
  | "TIMEOUT_ERROR" // 504
  | "NETWORK_ERROR"; // client-side: request never reached the proxy

/** One failed auth API call, normalized (the backend's error envelope is
 *  `{ error: { code, message, details? } }` — always present on failures). */
export class AuthApiError extends Error {
  readonly code: AuthErrorCode;
  /** Upstream/proxy HTTP status when the request got a response. */
  readonly status?: number;
  /** Milliseconds to wait when the backend supplies a retry hint (429). */
  readonly retryAfterMs?: number;

  constructor(args: {
    code: AuthErrorCode;
    message: string;
    status?: number;
    retryAfterMs?: number;
  }) {
    super(args.message);
    this.name = "AuthApiError";
    this.code = args.code;
    this.status = args.status;
    this.retryAfterMs = args.retryAfterMs;
  }
}

/** High-level auth status exposed through the context. */
export type AuthStatus =
  | "loading" // session restoration in flight (first paint of the app)
  | "authenticated" // verified session; user is resolved
  | "unauthenticated" // no valid session (guest)
  | "unavailable"; // auth backend not configured/unreachable — treat as guest
