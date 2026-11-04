"use client";

/**
 * Reset-password form (PART 4, step 4).
 *
 * Recovery flow, following the backend's ACTUAL mechanism
 * (docs/auth + live-verified controller):
 *
 *   1. The one-time token arrives in THIS page's URL
 *      (?token_hash=…&type=recovery — hash-token template, or ?token=… for
 *      the plain-OTP variant; both are documented backend inputs. NO tokens
 *      are ever fabricated).
 *   2. POST /api/auth/verify { type: 'recovery', tokenHash | token } → the
 *      backend issues a recovery session (cookies set upstream).
 *   3. POST /api/auth/password-update { password } on that session.
 *   4. The recovery session is then revoked (POST /logout) so the freshly
 *      set password is the only way back in — success asks for login.
 *
 * Invalid/expired/consumed links map to an explicit state with a fresh
 * request link (the backend returns AUTH_SESSION_EXPIRED for all three).
 * Tokens are never logged; the fallback Bearer from verify lives for the
 * single password-update retry at most.
 */

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  exchangeRecoveryToken,
  updatePassword as requestPasswordUpdate,
  logout as revokeSession,
} from "@/lib/auth/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/components/auth/ToastProvider";
import PasswordField from "@/components/auth/PasswordField";
import StatusBanner from "@/components/auth/StatusBanner";
import type { AuthErrorCode, AuthSessionTokens } from "@/lib/auth/types";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

type Phase =
  | "checking" // validating URL tokens
  | "form" // token accepted; new password inputs active
  | "updating" // POST password-update in flight
  | "done" // password changed (session revoked) → success panel
  | "invalid"; // missing/invalid/expired link

function failureTitle(code: AuthErrorCode): string {
  switch (code) {
    case "AUTH_SESSION_EXPIRED":
      return "This reset link is no longer valid. It may have expired or already been used.";
    case "RATE_LIMIT_ERROR":
      return "Too many attempts. Take a short pause, then request a fresh link.";
    case "VALIDATION_ERROR":
      return "This reset link is incomplete. Open it from the email exactly as sent.";
    case "PROXY_NOT_CONFIGURED":
    case "UPSTREAM_UNAVAILABLE":
    case "AUTH_PROVIDER_ERROR":
    case "TIMEOUT_ERROR":
    case "NETWORK_ERROR":
    case "INTERNAL_ERROR":
      return "The reset service is unavailable right now. Try the link again shortly.";
    default:
      return "The reset link couldn't be verified. Request a fresh link from the site.";
  }
}

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("checking");
  const [failure, setFailure] = useState<{ title: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string>();
  const [pending, setPending] = useState(false);

  /**
   * In-memory fallback token issued by verify (used ONLY if the upstream
   * deployment doesn't issue cookies). Never persisted, never logged; the
   * reference is dropped on unmount.
   */
  const [fallbackToken, setFallbackToken] = useState<AuthSessionTokens | null>(null);

  const tokenHash = searchParams.get("token_hash") ?? searchParams.get("tokenhash");
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  // Validate the link ONCE on arrival: a recovery-type one-time token must
  // exist. Anything else is an invalid link — no invented exchange flows.
  useEffect(() => {
    if (type !== "recovery" || (!tokenHash && !token)) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    setPhase("checking");
    setFailure(null);
    (async () => {
      const result = await exchangeRecoveryToken({
        ...(tokenHash ? { tokenHash } : { token: token as string }),
      });
      if (cancelled) return;

      if (result.kind === "user") {
        // Session established (cookies upstream). Keep the memory-only token
        // reference for the no-cookie fallback path, nothing more.
        setFallbackToken(result.sessionTokens);
        setPhase("form");
        return;
      }
      setPhase("invalid");
      setFailure({ title: failureTitle(result.error.code) });
    })();
    return () => {
      cancelled = true;
      setFallbackToken(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      setConfirmError(`Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`);
      return;
    }
    if (confirm !== password) {
      setConfirmError("Passwords don't match.");
      return;
    }
    setConfirmError(undefined);
    setPending(true);

    // Primary: cookie session from the recovery exchange. Fallback: the
    // in-memory Bearer token issued by verify (server may have no cookies).
    let result = await requestPasswordUpdate({ password });
    if (result.kind === "no-session" && fallbackToken) {
      result = await requestPasswordUpdate({ password, bearer: fallbackToken.accessToken });
    }
    setPending(false);

    if (result.kind === "updated") {
      // Restrict the recovery-session surface: revoke immediately.
      await revokeSession();
      void refreshUser();
      setPhase("done");
      toast({ tone: "success", message: "Password updated. You can sign in now." });
      return;
    }

    if (result.kind === "no-session") {
      setPhase("invalid");
      setFailure({ title: "Your recovery session ended before the change could be applied. Request a fresh link." });
      return;
    }

    setFailure({ title: failureTitle(result.error.code) });
  };

  if (phase === "checking") {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-10">
        <p className="inline-flex items-center gap-2.5 text-sm text-white/60" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Validating your reset link…
        </p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div aria-live="polite">
        <div className="rounded-2xl border border-white/15 bg-white/[0.05] p-6 text-center">
          <p className="inline-flex items-center gap-2.5 type-label text-base text-white">
            <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
            Password updated
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-white/65">
            Your new password is active and the reset session has been revoked.
            Sign in with your email and the new password.
          </p>
          <div className="mt-5">
            <Link
              href="/login"
              className="glass-btn glass-btn--bright type-label inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
            >
              Continue to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div aria-live="polite">
        <StatusBanner title={failure?.title ?? "This reset link is invalid."}>
          <p>
            Reset links are one-time and short-lived. Request a fresh one —
            there&apos;s nothing else you need.
          </p>
        </StatusBanner>
        <div className="mt-5 text-center">
          <Link
            href="/forgot-password"
            className="glass-btn type-label inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
          >
            Request a new reset link
          </Link>
        </div>
        <div className="mt-4 text-center text-xs">
          <Link
            href="/login"
            className="font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  // phase === "form" | "updating"
  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <PasswordField
          id="reset-password"
          label="New password"
          value={password}
          onChange={setPassword}
          disabled={pending}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint={`Between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`}
        />

        <PasswordField
          id="reset-confirm"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          error={confirmError}
          disabled={pending}
          autoComplete="new-password"
          revealWhenEmpty
        />

        {failure ? <StatusBanner title={failure.title} /> : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="glass-btn glass-btn--bright type-label mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>

      <div className="text-center text-xs">
        <Link
          href="/login"
          className="font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
