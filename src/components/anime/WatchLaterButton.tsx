"use client";

/**
 * Watch Later toggle — the ACCOUNT-BACKED watchlist (shared store).
 *
 * Signed in:
 *   - The check/plus icon flips IMMEDIATELY (optimistic UI) via the shared
 *     watchlist context, the change persists through the backend API, and a
 *     subtle toast confirms. A failed persist reverts the icon and toasts
 *     honestly — the backend stays the only source of truth.
 *
 * Signed out (never silently fails):
 *   - The attempted save is preserved (sessionStorage intent), the visitor
 *     is sent to the EXISTING login flow (/login?next=<this page>) instead
 *     of failing quietly, and once signed in the store completes the
 *     pending add automatically (its success toast is emitted once, by the
 *     WatchlistToasts bridge in the root layout).
 *
 * Visual contract unchanged: glass button circle, Plus ↔ Check by state,
 * `aria-pressed` for assistive tech, exact chip dimensions passed by callers.
 */

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { loginBackjumpUrl } from "@/lib/auth/paths";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/components/auth/ToastProvider";
import { savePendingWatchlistIntent } from "@/lib/watchlist/pending";
import { useWatchlist } from "@/lib/watchlist/watchlist-context";
import type { WatchlistFailureReason } from "@/lib/watchlist/types";
import type { HeroSlide } from "@/lib/types";

/**
 * Metadata the UI already knows about the title (year/format shown on the
 * watchlist page when hydrated instantly). Every existing caller supplies at
 * least { anilistId, title, posterUrl }; only the ANILIST ID goes upstream —
 * the open mapping (AniList ID = animeId, backend identity rule).
 */
type SaveTarget = Pick<HeroSlide, "anilistId" | "title" | "posterUrl"> &
  Partial<Pick<HeroSlide, "year">> & { format?: string | null };

/** Calm, specific copy per failure reason (never leaks internals). */
function failureMessage(reason: WatchlistFailureReason): string {
  switch (reason) {
    case "unavailable":
      return "Watchlist storage isn't reachable right now — your change was undone.";
    case "session-expired":
      return "Your session ended while saving. Sign in again, then try once more.";
    case "rate-limited":
      return "Too many watchlist changes. Take a short pause, then try again.";
    default:
      return "Saving didn't complete. Please try again.";
  }
}

export default function WatchLaterButton({
  slide,
  className = "h-12 w-12 sm:h-[52px] sm:w-[52px]",
}: {
  slide: SaveTarget;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status: authStatus } = useAuth();
  const { toast } = useToast();
  const { isSaved, add, remove } = useWatchlist();
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(user);
  const saved = signedIn && isSaved(slide.anilistId);

  const handleClick = async () => {
    if (busy) return; // one in-flight toggle per title

    if (!signedIn) {
      // Preserve exactly what the visitor tried to save, then use the
      // existing login flow; the destination (page + query) rides in ?next=
      // so login returns them here. While the auth store is still
      // restoring, this path self-heals: an already-authenticated visitor
      // is bounced straight back to `next` by the login page and the
      // pending intent completes.
      savePendingWatchlistIntent({
        animeId: slide.anilistId,
        title: slide.title,
        posterUrl: slide.posterUrl,
        year: slide.year ?? null,
        format: slide.format ?? null,
      });
      const destination =
        typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
      toast({ tone: "info", message: "Sign in to add titles to your watchlist." });
      router.push(loginBackjumpUrl(pathname, destination));
      return;
    }

    setBusy(true);
    const target = {
      animeId: slide.anilistId,
      title: slide.title,
      posterUrl: slide.posterUrl,
      year: slide.year ?? null,
      format: slide.format ?? null,
    };
    const result = saved ? await remove(slide.anilistId) : await add(target);
    setBusy(false);

    if (!result.ok) {
      toast({ tone: "error", message: failureMessage(result.reason) });
      return;
    }
    toast({
      tone: "success",
      message: saved ? "Removed from your watchlist." : "Added to your watchlist.",
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || authStatus === "loading"}
      aria-busy={busy}
      aria-pressed={saved}
      aria-label={
        saved
          ? `Remove ${slide.title} from Watch Later`
          : `Add ${slide.title} to Watch Later`
      }
      title={saved ? "In Watch Later" : "Add to Watch Later"}
      className={`glass-btn flex shrink-0 items-center justify-center rounded-full ${className} ${
        saved ? "glass-btn--bright" : "text-white"
      } ${busy ? "opacity-70" : ""}`}
    >
      {saved ? (
        <Check className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
      ) : (
        <Plus className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
      )}
    </button>
  );
}
