"use client";

/**
 * Login form (PART 3). Calls POST /api/auth/login through the auth store —
 * exact backend contract ({ email, password }), no extra fields invented
 * (the backend accepts no "remember me", so none is offered). On success the
 * session cookies are already set upstream; the form redirects to the
 * preserved destination (PART 9) without another /me roundtrip.
 *
 * Validation is client-side first (same rules the backend enforces: email
 * shape, non-empty password ≤128); backend failures map to calm inline
 * copy. When the upstream issues no session at all (confirm-email operator
 * setting still ON), the outcome is stated honestly as a failed sign-in —
 * there is NO activation/verification UX of any kind (product decision: no
 * verification screens; the backend's resend seam stays unused by the
 * frontend; see docs/auth/SUPABASE_SETUP.md).
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { safeAuthRedirectPath } from "@/lib/auth/paths";
import { useToast } from "@/components/auth/ToastProvider";
import PasswordField from "@/components/auth/PasswordField";
import StatusBanner from "@/components/auth/StatusBanner";
import { SITE_EMAIL } from "@/lib/site";
import type { AuthErrorCode } from "@/lib/auth/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

/** Banner content: a plain, honest message (no activation/verification states). */
type BannerState = { variant: "plain"; tone?: "error" | "warning" | "notice"; title: string; body?: string };

/** UI copy for each backend error code (failures never leak internals). */
function failureCopy(code: AuthErrorCode, retryAfterMs?: number): { tone: "error" | "warning" | "notice"; title: string; body?: string } {
  switch (code) {
    case "AUTH_INVALID_CREDENTIALS":
      return { tone: "error", title: "Incorrect email or password." };
    case "RATE_LIMIT_ERROR":
      return {
        tone: "warning",
        title:
          retryAfterMs && retryAfterMs > 15_000
            ? "Too many attempts. Try again in a few minutes."
            : "Too many attempts. Take a short pause, then try again.",
      };
    case "VALIDATION_ERROR":
      return { tone: "error", title: "Check the fields above — the server didn't accept this input." };
    case "FORBIDDEN_ERROR":
      return { tone: "notice", title: "Sign-ins are currently disabled upstream." };
    case "PROXY_NOT_CONFIGURED":
    case "UPSTREAM_UNAVAILABLE":
    case "AUTH_PROVIDER_ERROR":
    case "TIMEOUT_ERROR":
    case "NETWORK_ERROR":
    case "INTERNAL_ERROR":
      return {
        tone: "notice",
        title: "Authentication is unavailable right now.",
        body: "This usually resolves on its own — try again shortly.",
      };
    default:
      return { tone: "error", title: "Sign-in failed. Please try again." };
  }
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, status } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [pending, setPending] = useState(false);

  // Guests only: an already-signed-in visit never sits on the login page.
  // (Client nicety; real protection lives upstream.)
  useEffect(() => {
    if (status === "authenticated") router.replace(safeAuthRedirectPath(searchParams.get("next")));
  }, [status, router, searchParams]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = "Enter your email address.";
    else if (!EMAIL_PATTERN.test(trimmedEmail)) next.email = "That email address doesn't look valid.";
    if (!password) next.password = "Enter your password.";
    return next;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setPending(true);
    setBanner(null);
    const result = await login({ email: email.trim().toLowerCase(), password });
    setPending(false);

    if (result.kind === "user") {
      toast({ tone: "success", message: "Signed in. Welcome back." });
      router.replace(safeAuthRedirectPath(searchParams.get("next")));
      return;
    }

    if (result.kind === "session-not-issued") {
      // No session was created upstream (confirm-email operator setting still
      // ON; live-verified `{ session: null }`). Honest failed sign-in notice
      // — no activation/verification UI exists.
      setBanner({
        variant: "plain",
        tone: "warning",
        title: "Sign-in didn’t complete — no session was issued.",
        body: `Please try again in a little while, or contact ${SITE_EMAIL} if it keeps failing.`,
      });
      return;
    }

    setBanner({ variant: "plain", ...failureCopy(result.code, result.retryAfterMs) });
  };

  const nextParam = searchParams.get("next");
  const preserveNext = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="login-email" className="type-label mb-2 block text-sm text-white/80">
            Email <span className="text-white/40">*</span>
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
            placeholder="you@example.com"
            className="auth-input w-full px-4 py-3 text-sm"
          />
          {fieldErrors.email ? (
            <p id="login-email-error" role="alert" className="mt-1.5 text-xs font-medium text-red-300">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="login-password"
          label="Password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          disabled={pending}
          autoComplete="current-password"
          revealWhenEmpty
        />

        {banner ? (
          <StatusBanner tone={banner.tone} title={banner.title}>
            {banner.body ?? null}
          </StatusBanner>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="glass-btn glass-btn--bright type-label mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Signing in…" : "Log in"}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link
          href="/forgot-password"
          className="font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
        >
          Forgot your password?
        </Link>
        <Link
          href={`/signup${preserveNext}`}
          className="font-medium text-white/60 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
