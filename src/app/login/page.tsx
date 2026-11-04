import { Suspense } from "react";
import type { Metadata } from "next";
import AuthCard from "@/components/auth/AuthCard";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description:
    "Sign in to OFFANIME to use watch later lists and your account — cinematic anime streaming.",
};

export default function LoginPage() {
  return (
    <AuthCard
      eyebrow="Account access"
      title="Log in"
      lead="Welcome back. Enter your details to continue where you left off."
    >
      <Suspense
        fallback={<p className="text-center text-sm text-white/40">Loading the login form…</p>}
      >
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
