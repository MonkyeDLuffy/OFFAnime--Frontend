"use client";

/**
 * Signup form (PART 2 — NO email verification, NO verification UI).
 * Fields mirror the backend signup contract EXACTLY: { email, password }.
 * The backend accepts no username / display-name / confirmation payload, so
 * none is offered.
 *
 * On success the backend issues the session directly (cookies set upstream)
 * and the user is adopted immediately — usable on the same click. The one
 * branch that cannot produce a session is the operator's confirm-email
 * setting (live-verified: `{ session: null, emailConfirmationRequired: true }`):
 * the outcome is stated honestly with a normal sign-in fallback — there are
 * NO verification screens, NO "check your email" copy, NO resend buttons and
 * NO cooldowns; future resend support stays isolated in
 * `src/lib/auth/resend-future.ts` with a TODO.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { safeAuthRedirectPath } from "@/lib/auth/paths";
import { useToast } from "@/components/auth/ToastProvider";
import PasswordField from "@/components/auth/PasswordField";
import StatusBanner from "@/components/auth/StatusBanner";
import { SITE_EMAIL } from "@/lib/site";
import type { AuthErrorCode } from "@/lib/auth/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Backend bounds (auth.controller.js): 8–128 characters. */
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

interface FieldErrors {
  email?: string;
  password?: string;
  confirm?: string;
}

type BannerState =
  | { variant: "session-not-issued" }
  | { variant: "plain"; tone?: "error" | "warning" | "notice"; title: string; body?: string };

function failureCopy(code: AuthErrorCode, retryAfterMs?: number): { tone: "error" | "warning" | "notice"; title: string; body?: string } {
  switch (code) {
    case "AUTH_EMAIL_TAKEN":
      return { tone: "error", title: "An account with this email already exists. Try signing in instead." };
    case "RATE_LIMIT_ERROR":
      return {
        tone: "warning",
        title:
          retryAfterMs && retryAfterMs > 15_000
            ? "Too many attempts. Please wait a few minutes before trying again."
            : "Too many attempts. Take a short pause, then try again.",
      };
    case "FORBIDDEN_ERROR":
      return { tone: "notice", title: "Account creation is currently disabled upstream." };
    case "VALIDATION_ERROR":
      return { tone: "error", title: "Check the fields above — the server didn't accept this input." };
    case "PROXY_NOT_CONFIGURED":
    case "UPSTREAM_UNAVAILABLE":
    case "AUTH_PROVIDER_ERROR":
    case "TIMEOUT_ERROR":
    case "NETWORK_ERROR":
    case "INTERNAL_ERROR":
      return {
        tone: "notice",
        title: "Account creation is unavailable right now.",
        body: "This usually resolves on its own — try again shortly.",
      };
    default:
      return { tone: "error", title: "Registration failed. Please try again." };
  }
}

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signup, status } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [pending, setPending] = useState(false);
  /** Guards against duplicate submissions while a request is already in flight. */
  const inFlight = useRef(false);

  // Already signed in → straight to the site (see login form note).
  useEffect(() => {
    if (status === "authenticated") router.replace(safeAuthRedirectPath(searchParams.get("next")));
  }, [status, router, searchParams]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = "Enter an email address.";
    else if (!EMAIL_PATTERN.test(trimmedEmail)) next.email = "That email address doesn't look valid.";
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      next.password = `Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters.`;
    }
    if (confirm !== password) {
      next.confirm = "Passwords don't match.";
    }
    return next;
  };

  /** Clear field-level and banner errors for the field the user just touched. */
  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    // A banner that is purely a field-level backstop (email-taken / rate-limit)
    // stops being relevant once the user edits that field.
    if (field === "email" && banner?.variant === "plain") {
      setBanner(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Block duplicate submissions while a request is already in flight.
    if (inFlight.current) return;
    inFlight.current = true;

    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      inFlight.current = false;
      return;
    }

    setPending(true);
    setBanner(null);
    const result = await signup({ email: email.trim().toLowerCase(), password });
    setPending(false);
    inFlight.current = false;

    if (result.kind === "user") {
      // No verification step anywhere — straight into the site.
      // Clear any stale error state before navigating away.
      setBanner(null);
      setFieldErrors({});
      toast({ tone: "success", message: "Account created. Welcome to OFFANIME." });
      router.replace(safeAuthRedirectPath(searchParams.get("next")));
      return;
    }

    if (result.kind === "session-not-issued") {
      // The upstream accepted the account but issued no session (its
      // confirm-email operator setting, which OFFANIME keeps OFF). Honest
      // fallback: normal sign-in — no verification workflow exists.
      setBanner({ variant: "session-not-issued" });
      return;
    }

    // Only a genuine backend rate-limit (429 RATE_LIMIT_ERROR) carries the
    // rate-limit warning. Every other error is mapped to its own copy.
    if (result.code === "RATE_LIMIT_ERROR") {
      setFieldErrors((current) => ({
        ...current,
        email: current.email ?? undefined,
      }));
    } else if (result.code === "AUTH_EMAIL_TAKEN") {
      setFieldErrors((current) => ({
        ...current,
        email:
          current.email ??
          "An account with this email already exists. Try signing in instead.",
      }));
    }
    setBanner({ variant: "plain", ...failureCopy(result.code, result.retryAfterMs) });
  };

  const nextParam = searchParams.get("next");
  const preserveNext = nextParam ? `?next=${encodeURIComponent(nextParam)}` : "";

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="signup-email" className="type-label mb-2 block text-sm text-white/80">
            Email <span className="text-white/40">*</span>
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError("email");
            }}
            disabled={pending}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
            placeholder="you@example.com"
            className="auth-input w-full px-4 py-3 text-sm"
          />
          {fieldErrors.email ? (
            <p id="signup-email-error" role="alert" className="mt-1.5 text-xs font-medium text-red-300">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <PasswordField
          id="signup-password"
          label="Password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            clearFieldError("password");
          }}
          error={fieldErrors.password}
          disabled={pending}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint={`Between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`}
        />

        <PasswordField
          id="signup-confirm"
          label="Confirm password"
          value={confirm}
          onChange={(value) => {
            setConfirm(value);
            clearFieldError("confirm");
          }}
          error={fieldErrors.confirm}
          disabled={pending}
          autoComplete="new-password"
          revealWhenEmpty
        />

        {banner ? (
          banner.variant === "session-not-issued" ? (
            <StatusBanner tone="warning" title="Automatic sign-in didn’t complete.">
              <p>
                Your account was created, but the account service didn’t issue
                a sign-in session for it. Continue by{" "}
                <Link
                  href={`/login${preserveNext}`}
                  className="font-semibold underline decoration-amber-200/50 underline-offset-2 hover:decoration-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
                >
                  signing in
                </Link>{" "}
                — nothing extra is needed from you. If sign-in keeps failing,
                contact{" "}
                <a
                  href={`mailto:${SITE_EMAIL}`}
                  className="font-semibold underline decoration-amber-200/50 underline-offset-2 hover:decoration-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
                >
                  {SITE_EMAIL}
                </a>
                .
              </p>
            </StatusBanner>
          ) : (
            <StatusBanner tone={banner.tone} title={banner.title}>
              {banner.body ?? null}
            </StatusBanner>
          )
        ) : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="glass-btn glass-btn--bright type-label mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="text-center text-xs">
        <p className="text-white/55">
          Already have an account?{" "}
          <Link
            href={`/login${preserveNext}`}
            className="font-semibold text-white/85 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
