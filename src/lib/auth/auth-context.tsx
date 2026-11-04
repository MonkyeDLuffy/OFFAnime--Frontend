"use client";

/**
 * Global authentication store (PART 6) — ONE provider mounted once in the
 * root layout; every page/component reads the same context. No component
 * implements its own session logic.
 *
 * Behavior contract:
 *   - restore(): on mount, ONE session check servers the whole app
 *     (GET /api/auth/me through the same-origin proxy → HttpOnly cookies).
 *     React StrictMode double-mounts are de-duplicated via an in-flight
 *     promise. Route changes never re-check.
 *   - expired/revoked sessions: the documented refresh-once-then-retry
 *     sequence (backend.md §6): /me → AUTH_SESSION_EXPIRED → /refresh →
 *     /me again → else `unauthenticated`.
 *   - login/signup adopt the verified `user` straight from the response —
 *     no extra /me roundtrip.
 *   - logout: POST /logout (revoke + cookie clear upstream), clears local
 *     user state; user-scoped stores purge themselves on the sign-out
 *     transition (e.g. the watchlist provider reacts to the session change),
 *     then hands the caller to the public anime page (router work owned
 *     by component).
 *   - `unavailable`: auth backend not configured/unreachable. Treated as
 *     guest for the navbar; auth pages show a calm availability notice.
 *
 * Tokens never enter this module's state — only the AuthUser is held.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCurrentUser,
  login as requestLogin,
  signup as requestSignup,
  logout as requestLogout,
} from "./api-client";
import type { AuthErrorCode, AuthStatus, AuthUser } from "./types";

export interface LoginInput {
  email: string;
  password: string;
}

export type AuthActionResult =
  | { kind: "user"; user: AuthUser }
  /**
   * The provider issued NO session for the account (its confirm-email
   * setting is ON upstream — operator configuration, docs/auth/
   * SUPABASE_SETUP.md). OFFANIME has no verification workflow (product
   * decision): the UI offers the normal sign-in path — never a verification
   * screen, never a faked logged-in state.
   */
  | { kind: "session-not-issued"; user: AuthUser }
  | {
      kind: "error";
      message: string;
      /** Normalized backend error code, for exact UI copy. */
      code: AuthErrorCode;
      /** Retry hint (429 flows) when the backend supplies one. */
      retryAfterMs?: number;
    };

export interface AuthContextValue {
  /** High-level status; `loading` only during the single mount restore. */
  status: AuthStatus;
  user: AuthUser | null;
  isLoadingUser: boolean;
  /** Deprecated alias for `status === "loading"` — direct status preferred. */
  loading: boolean;
  login(input: LoginInput): Promise<AuthActionResult>;
  signup(input: LoginInput): Promise<AuthActionResult>;
  /** Revokes the session, clears caches; caller navigates afterwards. */
  logout(): Promise<{ ok: boolean; message?: string }>;
  /** Manual /me refresh (e.g. after profile-affecting actions). */
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Raw context handle — exported for dev-only visual harnesses and tests.
 * Application code must always go through `useAuth`.
 */
export { AuthContext };

/** Copy for the upstream-deployment "not configured" state (live-verified). */
const UNAVAILABLE_MESSAGE =
  "The account service is temporarily unavailable. Please try again in a little while.";

function describeFailure(message: string | undefined): string {
  // Concrete upstream validation detail, otherwise a calm generic fallback.
  return message && message.length > 0 ? message : "Something went wrong. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const restoreRef = useRef<Promise<void> | null>(null);

  /**
   * Single session restoration for the entire app. StrictMode mounts run
   * this once (in-flight memoization), so no repeated /me calls occur.
   */
  const restore = useCallback((): Promise<void> => {
    if (restoreRef.current) return restoreRef.current;
    restoreRef.current = (async () => {
      let current = await fetchCurrentUser();

      // Documented recovery: on an expired session, refresh EXACTLY once and
      // retry /me; otherwise the session is dead (guest).
      if (current.kind === "session-expired") {
        const { refreshSession } = await import("./api-client");
        await refreshSession();
        current = await fetchCurrentUser();
      }

      if (current.kind === "user" && current.user.email) {
        setUser(current.user);
        setStatus("authenticated");
      } else if (current.kind === "unavailable") {
        setUser(null);
        setStatus("unavailable");
      } else {
        setUser(null);
        setStatus("unauthenticated");
      }
      restoreRef.current = null; // allow an explicit refresh later
    })();
    return restoreRef.current;
  }, []);

  // Mount restore — the whole app's one /me call.
  useEffect(() => {
    void restore();
  }, [restore]);

  const login = useCallback(async ({ email, password }: LoginInput): Promise<AuthActionResult> => {
    const result = await requestLogin({ email, password });
    if (result.kind === "user") {
      setUser(result.user);
      setStatus("authenticated");
      return { kind: "user", user: result.user };
    }
    if (result.kind === "session-not-issued") {
      // The upstream still requires activation (live: user in body but NO
      // session). Stated honestly as a failed sign-in — no user state, no
      // verification UX, no faked session.
      setStatus("unauthenticated");
      setUser(null);
      return { kind: "session-not-issued", user: result.user };
    }
    setStatus("unauthenticated");
    setUser(null);
    return {
      kind: "error",
      message: describeFailure(result.error.message),
      code: result.error.code,
      retryAfterMs: result.error.retryAfterMs,
    };
  }, []);

  const signup = useCallback(async ({ email, password }: LoginInput): Promise<AuthActionResult> => {
    const result = await requestSignup({ email, password });
    if (result.kind === "user") {
      setUser(result.user);
      setStatus("authenticated");
      return { kind: "user", user: result.user };
    }
    if (result.kind === "session-not-issued") {
      // Confirm-email is ON upstream (product wants it OFF); state honestly,
      // never invent a session.
      return { kind: "session-not-issued", user: result.user };
    }
    return {
      kind: "error",
      message: describeFailure(result.error.message),
      code: result.error.code,
      retryAfterMs: result.error.retryAfterMs,
    };
  }, []);

  const logout = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    const result = await requestLogout();
    // Local user state is cleared for both clean outcomes; only transport/
    // upstream failures keep the local session (retryable, cookie survives).
    if (result.kind === "error") {
      return { ok: false, message: UNAVAILABLE_MESSAGE };
    }

    setUser(null);
    setStatus("unauthenticated");

    // User-scoped stores purge themselves on this sign-out transition (the
    // watchlist provider reacts to the session change — nothing of the user
    // survives in browser storage).

    return { ok: true };
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const current = await fetchCurrentUser();
    if (current.kind === "user" && current.user.email) {
      setUser(current.user);
      setStatus("authenticated");
    } else if (current.kind === "unavailable") {
      setStatus("unavailable");
      setUser(null);
    } else {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isLoadingUser: status === "loading",
      loading: status === "loading",
      login,
      signup,
      logout,
      refreshUser,
    }),
    [status, user, login, signup, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Single access point for the global auth state. Must be inside AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within the AuthProvider (mounted in the root layout).");
  }
  return context;
}
