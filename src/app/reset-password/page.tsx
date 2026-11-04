import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your OFFANIME account using your reset link.",
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      eyebrow="Password recovery"
      title="Choose a new password"
      lead="Reset links are one-time and short-lived. Open this page from the email we sent you."
    >
      <Suspense
        fallback={<p className="text-center text-sm text-white/40">Loading the reset form…</p>}
      >
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
