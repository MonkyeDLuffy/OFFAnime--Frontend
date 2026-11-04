import type { Metadata } from "next";
import WatchlistView from "@/components/watchlist/WatchlistView";

export const metadata: Metadata = {
  title: "My Watchlist",
  description: "Your saved OFFANIME watch list, kept on your account.",
};

/**
 * /watchlist — the account-backed watchlist (PART: user data).
 *
 * The server shell only sets metadata; every visible state lives in
 * `WatchlistView` (client): loading skeletons, guest sign-in prompt (no
 * automatic redirect — the destination is preserved via ?next=), empty
 * state, and the saved-titles grid fed by the shared watchlist store. Data
 * authority is the backend (`/api/watchlist`, requireUser-guarded, RLS
 * per docs/watchlist/BACKEND_CONTRACT.md); the client session is a UX signal
 * only.
 */
export default function WatchlistPage() {
  return (
    <main className="relative min-h-[100svh]">
      {/* Same subtle top wash as the other account-area pages. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(140,140,190,0.08),transparent_75%)]"
      />
      <div className="watch-enter relative mx-auto max-w-7xl px-6 pb-24 pt-28 sm:px-10 sm:pt-32">
        <h1 className="type-display text-[30px] sm:text-40px text-white">
          My Watchlist
        </h1>
        <p className="mt-2 text-sm text-white/55">
          Titles you keep on your account — always in sync, never shared.
        </p>
        <div className="mt-10">
          <WatchlistView />
        </div>
      </div>
    </main>
  );
}
