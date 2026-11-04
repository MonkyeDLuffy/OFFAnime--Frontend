import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your OFFANIME account — no verification step, start watching immediately.",
};

export default function SignupPage() {
  return (
    <AuthCard
      eyebrow="New here"
      title="Create your account"
      lead="One email and password — no verification step. Your account is ready the moment you create it."
    >
      <Suspense
        fallback={<p className="text-center text-sm text-white/40">Loading the signup form…</p>}
      >
        <SignupForm />
      </Suspense>
    </AuthCard>
  );
}
