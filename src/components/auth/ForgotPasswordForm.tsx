"use client";

/**
 * Forgot-password form → POST /api/auth/password-reset (PART 4).
 *
 * The backend's response is UNIFORM (`200 { ok: true }`) regardless of
 * whether an account exists, and the UI mirrors that exactly: one calm
 * confirmation panel, no hints about existence, no eligibility details
 * beyond the documented behavior. Success copy explains that a reset email
 * will arrive IF the address is eligible, with a return-to-login action.
 *
 * The actual email is sent by Supabase Auth upstream (the backend has no
 * email service of its own — verified in its source). The branded template
 * lives in the Supabase dashboard; the ready-to-paste version is in
 * docs/auth/reset-password-email.html. The future resend endpoint is NOT
 * touched — this flow is fully independent (PART 5).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { requestPasswordResetEmail } from "@/lib/auth/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthErrorCode } from "@/lib/auth/types";
import StatusBanner from "@/components/auth/StatusBanner";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Phase = "idle" | "sending" | "sent";

function failureCopy(code: AuthErrorCode, retryAfterMs?: number): { title: string; body?: string } {
  switch (code) {
    case "RATE_LIMIT_ERROR":
      return {
        title:
          retryAfterMs && retryAfterMs > 15_000
            ? "Too many reset attempts. Please wait a few minutes."
            : "Too many reset attempts. Take a short pause, then try again.",
      };
    case "VALIDATION_ERROR":
      return { title: "That email address wasn't accepted — double-check the format." };
    case "PROXY_NOT_CONFIGURED":
    case "UPSTREAM_UNAVAILABLE":
    case "AUTH_PROVIDER_ERROR":
    case "TIMEOUT_ERROR":
    case "NETWORK_ERROR":
    case "INTERNAL_ERROR":
      return {
        title: "The reset service is unavailable right now.",
        body: "Try again shortly — nothing was sent this time.",
      };
    default:
      return { title: "Couldn't start the reset. Please try again." };
  }
}

export default function ForgotPasswordForm() {
  const router = useRouter();
  const { status } = useAuth();

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<{ title: string; body?: string } | null>(null);

  // Signed-in users don't need a reset screen.
  useEffect(() => {
    if (status === "authenticated") router.replace("/anime");
  }, [status, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Enter the email you signed up with.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setFieldError("That email address doesn't look valid.");
      return;
    }
    setFieldError(undefined);
    setFailure(null);
    setPhase("sending");

    const result = await requestPasswordResetEmail({ email: trimmed.toLowerCase() });
    if (result.kind === "sent") {
      // Uniform success — identical handling for every address.
      setPhase("sent");
      return;
    }
    setPhase("idle");
    setFailure(failureCopy(result.error.code, result.error.retryAfterMs));
  };

  if (phase === "sent") {
    // Anti-enumeration confirmation (PART 4, step 2): no existence hints.
    return (
      <div aria-live="polite">
        <div className="rounded-2xl border border-white/15 bg-white/[0.05] p-5">
          <p className="flex items-center gap-2.5 type-label text-sm text-white">
            <MailCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            Check your inbox
          </p>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            If an OFFANIME account for{" "}
            <span className="break-all font-semibold text-white/95">{email.trim().toLowerCase()}</span>{" "}
            is eligible for recovery, a reset link will arrive shortly. Use it before it expires —
            the link is one-time only.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Didn&apos;t get anything? The address may not be eligible, or the email could be a
            little delayed.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="glass-btn type-label inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to login
            </Link>
            <button
              type="button"
              onClick={() => {
                setPhase("idle");
                setEmail("");
              }}
              className="text-xs font-medium text-white/55 underline decoration-white/25 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="forgot-email" className="type-label mb-2 block text-sm text-white/80">
            Email <span className="text-white/40">*</span>
          </label>
          <input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldError) setFieldError(undefined);
            }}
            disabled={phase === "sending"}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "forgot-email-error" : undefined}
            placeholder="you@example.com"
            className="auth-input w-full px-4 py-3 text-sm"
          />
          {fieldError ? (
            <p id="forgot-email-error" role="alert" className="mt-1.5 text-xs font-medium text-red-300">
              {fieldError}
            </p>
          ) : null}
        </div>

        {failure ? <StatusBanner title={failure.title}>{failure.body ?? null}</StatusBanner> : null}

        <button
          type="submit"
          disabled={phase === "sending"}
          aria-busy={phase === "sending"}
          className="glass-btn glass-btn--bright type-label mt-1 inline-flex w-full items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
        >
          {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {phase === "sending" ? "Sending…" : "Send reset link"}
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
