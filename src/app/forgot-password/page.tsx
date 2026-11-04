import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a password-reset email for your OFFANIME account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Password recovery"
      title="Forgot your password?"
      lead="No worries. Enter the email you signed up with and we'll send you a reset link."
    >
      <Suspense
        fallback={<p className="text-center text-sm text-white/40">Loading the form…</p>}
      >
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
