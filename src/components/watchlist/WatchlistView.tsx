"use client";

/**
 * /watchlist view — the signed-in user's account-backed list (PART: user
 * data). Every status is honest:
 *
 *   - session restoring → skeleton (no flash of a fake empty list)
 *   - guest (or auth unavailable) → a sign-in PROMPT — never an automatic
 *     redirect and never silent access denial; the destination is preserved
 *     via the established ?next= mechanism
 *   - loading → skeletons, ready+items → glass grid, ready+empty → empty
 *     state with the Browse Anime entry
 *   - `unavailable` → the watchlist storage can't be reached from this
 *     deployment right now (backend reachable but storage failing, or the
 *     endpoints are not deployed yet — docs/watchlist/BACKEND_CONTRACT.md);
 *     a retry re-queries the backend
 *   - `expired` → the session died between pages; sign in again
 *
 * All data comes from the shared watchlist store (ONE list fetch per sign-in
 * for the whole app); removal happens through the same optimistic store the
 * bookmark buttons use, so every surface stays synchronized.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, RotateCcw, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { loginBackjumpUrl } from "@/lib/auth/paths";
import { useWatchlist } from "@/lib/watchlist/watchlist-context";
import WatchlistCard from "./WatchlistCard";

function SkeletonCard() {
  return (
    <li className="w-full">
      {/* Shimmer language shared with the details skeleton (globals.css). */}
      <div className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite] shadow-[0_6px_20px_rgba(0,0,0,0.45)]" />
      <div className="mt-3 h-4 w-3/4 rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite]" />
      <div className="mt-2 h-3 w-1/2 rounded bg-gradient-to-x from-[#0f1116] via-[#161820] to-[#0f1116] animate-[shimmer_3s_ease-in-out_infinite]" />
    </li>
  );
}

function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <ul
      aria-label="Loading your watchlist"
      className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </ul>
  );
}

/** Shared shell for every status panel (glass, centered, cinematic). */
function StatusPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-panel mx-auto flex max-w-xl flex-col items-center rounded-2xl px-6 py-12 text-center sm:px-12">
      {children}
    </div>
  );
}

const gridClasses =
  "grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6";

export default function WatchlistView() {
  const { user, status: authStatus } = useAuth();
  const { status, items, reload } = useWatchlist();
  const pathname = usePathname();

  if (authStatus === "loading") {
    return <SkeletonGrid />;
  }

  if (!user) {
    // Guest prompt (also the degrade for an unavailable auth backend).
    return (
      <StatusPanel>
        <span className="glass-btn glass-btn--bright pointer-events-none flex h-16 w-16 items-center justify-center rounded-full">
          <Bookmark className="h-7 w-7 fill-current" aria-hidden="true" />
        </span>
        <h2 className="type-display mt-5 text-3xl text-white sm:text-40px">
          Sign in to see your watchlist
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Your watchlist is saved to your OFFANIME account — every title you
          keep follows you across devices and stays safely separate from other
          accounts.
        </p>
        {/* Existing login flow (there is no separate login modal); the
            destination rides in ?next= so login returns straight here. */}
        <Link
          href={loginBackjumpUrl(pathname)}
          className="glass-btn glass-btn--bright type-label mt-7 inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-sm"
        >
          <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
          Sign in
        </Link>
      </StatusPanel>
    );
  }

  if (status === "loading") {
    return <SkeletonGrid />;
  }

  if (status === "expired") {
    return (
      <StatusPanel>
        <span className="glass-btn pointer-events-none flex h-16 w-16 items-center justify-center rounded-full text-white">
          <LogIn className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="type-display mt-5 text-3xl text-white sm:text-40px">
          Your session has ended
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Your watchlist couldn’t be confirmed with the account service. Sign
          in again to pick up exactly where you left off.
        </p>
        <Link
          href={loginBackjumpUrl(pathname)}
          className="glass-btn glass-btn--bright type-label mt-7 inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-sm"
        >
          <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
          Sign in again
        </Link>
      </StatusPanel>
    );
  }

  if (status === "unavailable") {
    return (
      <StatusPanel>
        <span className="glass-btn pointer-events-none flex h-16 w-16 items-center justify-center rounded-full text-white">
          <RotateCcw className="h-6 w-6" aria-hidden="true" />
        </span>
        <h2 className="type-display mt-5 text-3xl text-white sm:text-40px">
          Watchlist storage isn’t reachable right now
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Your watchlist lives safely on OFFANIME’s account servers, but they
          aren’t answering at the moment. Nothing is lost — try again in a
          few moments.
        </p>
        <button
          type="button"
          onClick={reload}
          className="glass-btn glass-btn--bright type-label mt-7 inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-sm"
        >
          <RotateCcw className="h-[18px] w-[18px]" aria-hidden="true" />
          Try again
        </button>
      </StatusPanel>
    );
  }

  if (items.length === 0) {
    return (
      <StatusPanel>
        <span className="glass-btn pointer-events-none flex h-16 w-16 items-center justify-center rounded-full text-white">
          <Bookmark className="h-7 w-7" aria-hidden="true" />
        </span>
        <h2 className="type-display mt-5 text-3xl text-white sm:text-40px">
          Nothing saved yet
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Tap the bookmark on any title to add it here. It’ll be waiting on
          every device you sign in from.
        </p>
        <Link
          href="/anime"
          className="glass-btn glass-btn--bright type-label mt-7 inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-sm"
        >
          <Bookmark className="h-[18px] w-[18px]" aria-hidden="true" />
          Browse Anime
        </Link>
      </StatusPanel>
    );
  }

  return (
    <>
      <p className="type-label text-[13px] uppercase tracking-[0.18em] text-white/45">
        {items.length} {items.length === 1 ? "title" : "titles"} saved
      </p>
      <ul aria-label="Your saved titles" className={`mt-6 ${gridClasses}`}>
        {items.map((entry) => (
          <WatchlistCard key={entry.animeId} entry={entry} />
        ))}
      </ul>
    </>
  );
}
