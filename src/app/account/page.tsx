import type { Metadata } from "next";
import Link from "next/link";
import { Settings, ShieldCheck, UserRound } from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Settings for your OFFANIME account.",
};

/**
 * /account placeholder for the dropdown's Account Settings destination —
 * real self-service settings arrive with the account phase. Same guard
 * contract as the watchlist: verified session required, destination
 * preserved on the login backjump.
 */
export default function AccountPage() {
  return (
    <ProtectedRoute>
      <main className="relative min-h-[100svh]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(140,140,190,0.08),transparent_75%)]"
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-28 sm:px-10 sm:pt-32">
          <p className="type-label text-[11px] uppercase text-white/40">Account</p>
          <h1 className="type-display mt-4 text-[30px] sm:text-40px text-white">Account Settings</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
            Profile, password and session controls for your account — coming in the next phase.
            Changing your password is already possible from any reset flow (you&apos;ll receive
            the standard reset email).
          </p>
          <div className="glass-panel mt-8 rounded-3xl p-6 sm:p-8">
            <p className="flex items-center gap-2.5 type-label text-sm text-white">
              <Settings className="h-4 w-4 text-white/60" aria-hidden="true" />
              Settings
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Nothing is configurable in this preview of your account. When settings ship,
              they&apos;ll list here: display name, password change and active session
              management.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/anime"
                className="glass-btn type-label inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
              >
                Continue browsing
              </Link>
              <Link
                href="/forgot-password"
                className="glass-btn type-label inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
              >
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                Change password
              </Link>
            </div>
          </div>
          <p className="mt-8 flex items-start gap-2.5 text-xs leading-relaxed text-white/40">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            This page requires a verified session — access never rests on a client-side flag
            alone.
          </p>
        </div>
      </main>
    </ProtectedRoute>
  );
}
