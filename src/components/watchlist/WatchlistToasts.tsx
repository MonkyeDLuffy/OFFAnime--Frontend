"use client";

/**
 * Success feedback for the AUTO-COMPLETED guest intent (the bookmark a
 * signed-out visitor attempted before being sent to log in).
 *
 * Mounted ONCE in the root layout so the toast fires exactly once per
 * completed intent regardless of how many WatchLaterButtons are rendered —
 * the buttons themselves never announce this event.
 *
 * The provider's `completedIntent` is a consumed-once signal: this bridge
 * acknowledges it right after toasting, so a later completion (even the
 * identical title) notifies again.
 */

import { useEffect } from "react";
import { useToast } from "@/components/auth/ToastProvider";
import { useWatchlist } from "@/lib/watchlist/watchlist-context";

export default function WatchlistToasts() {
  const { completedIntent, clearCompletedIntent } = useWatchlist();
  const { toast } = useToast();

  useEffect(() => {
    if (!completedIntent) return;
    toast({
      tone: "success",
      message: `Added “${completedIntent.title}” to your watchlist.`,
    });
    clearCompletedIntent();
  }, [completedIntent, clearCompletedIntent, toast]);

  return null;
}
