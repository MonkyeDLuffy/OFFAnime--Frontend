"use client";

/**
 * Route guard for authenticated-only pages (PART 9).
 *
 * - Unauthenticated → backjump to /login, PRESERVING the exact destination
 *   (path + query) in ?next= so a successful login returns the user here.
 * - Status `unavailable` degrades to an honest notice (never fakes access).
 * - The client session is a UX signal only: the real authority for future
 *   account data is the backend (requireUser middleware verifies every
 *   upstream token). Client flags are never trusted as proof.
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { loginBackjumpUrl } from "@/lib/auth/paths";

export default function ProtectedRoute({
  children,
  /** Optionally override what the user sees while resolving (e.g. skeletons). */
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(loginBackjumpUrl(pathname, searchParams.toString()));
    }
    if (status === "unavailable") {
      router.replace("/anime");
    }
  }, [status, router, pathname, searchParams]);

  if (status === "loading") {
    return (
      fallback ?? (
        <main className="relative min-h-[100svh]">
          <div className="relative mx-auto flex min-h-[100svh] max-w-md items-center justify-center px-6 pt-24">
            <p
              role="status"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[0.05] px-5 py-3 text-sm text-white/60 backdrop-blur-md"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking your session…
            </p>
          </div>
        </main>
      )
    );
  }

  if (status !== "authenticated") {
    // Redirect is already queued — inert placeholder prevents content flicker.
    return (
      <main className="relative min-h-[100svh]">
        <div className="relative mx-auto flex min-h-[100svh] max-w-md items-center justify-center px-6 pt-24">
          <p role="status" className="inline-flex items-center gap-2.5 text-sm text-white/40">
            Redirecting to sign in…
          </p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
