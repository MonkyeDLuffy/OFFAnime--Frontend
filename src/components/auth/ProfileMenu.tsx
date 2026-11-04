"use client";

/**
 * Signed-in navbar control (PART 8): avatar chip + premium Liquid Glass
 * dropdown with username, email, My Watchlist (the live account-backed
 * screen) and Account Settings (a placeholder for the upcoming screen), plus
 * logout.
 *
 * Behavior/animation contract with `site-navbar.tsx`:
 *   - Same glass language as the pill (denser fill so the menu stays
 *     readable over bright artwork).
 *   - Subtle pop on the shared cinematic curve, motion-safe only.
 *   - Closes on outside pointerdown, Escape (focus returns to the trigger),
 *     route change, and any activation inside.
 *   - The trigger keeps the EXACT chip dimensions used elsewhere in the
 *     pill (h-8 w-8 mobile / h-9 w-9 sm+) so the navbar's geometry and
 *     animations are preserved 1:1.
 *
 * Logout is a real POST /api/auth/logout via the auth store; on clean
 * success the navbar swaps back to the Login chip automatically and the
 * caller is passed to the public anime page by the store contract (PART 7).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Loader2, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/components/auth/ToastProvider";

export default function ProfileMenu() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [pendingLogout, setPendingLogout] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Outside interaction + Escape — the menu is small, so a container-level
  // listener is enough (no portal: it lives inside the fixed navbar already).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Route change closes the menu (login/logout/back behavior included).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    if (pendingLogout) return;
    setPendingLogout(true);
    const result = await logout();
    setPendingLogout(false);
    setOpen(false);
    if (result.ok) {
      toast({ tone: "info", message: "Signed out." });
      // Public destination (PART 7) — handled by the owner of the navbar.
      window.location.assign("/anime");
    } else {
      toast({ tone: "error", message: "Sign-out didn't complete. Try again shortly." });
    }
  };

  if (!user) return null;

  // Friendly name: username (display name) → the local part of the email.
  const emailLocal = user.email.split("@")[0] ?? "user";
  const displayName = user.displayName || emailLocal;
  const initial = displayName.charAt(0).toUpperCase() || "O";

  const menuLinkClass =
    "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm text-white/75 transition-colors duration-150 hover:bg-white/[0.09] hover:text-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/90";

  return (
    <div ref={rootRef} className="relative">
      {/* Avatar trigger — same chip geometry as the other pill controls. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        className="nav-chip nav-avatar h-8 w-8 sm:h-9 sm:w-9"
      >
        <span aria-hidden="true" className="type-label text-[15px] leading-none text-white/95">
          {initial}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="profile-dropdown profile-pop absolute right-0 top-[calc(100%+12px)] z-50 w-[min(78vw,288px)] overflow-hidden rounded-2xl p-1.5"
        >
          {/* Identity block */}
          <div className="px-3 pb-2 pt-3">
            <p className="type-label truncate text-base text-white">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-white/55" title={user.email}>
              {user.email}
            </p>
          </div>
          <div aria-hidden="true" className="mx-2 my-1 h-px bg-white/10" />

          {/* My Watchlist is live (account-backed); Account Settings remains
              the one placeholder destination. */}
          <Link href="/watchlist" role="menuitem" className={menuLinkClass} onClick={() => setOpen(false)}>
            <Bookmark className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
            My Watchlist
          </Link>
          <Link href="/account" role="menuitem" className={menuLinkClass} onClick={() => setOpen(false)}>
            <Settings className="h-4 w-4 shrink-0 text-white/55" aria-hidden="true" />
            Account Settings
            <span
              aria-hidden="true"
              className="type-label ml-auto rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase text-white/45"
            >
              Soon
            </span>
          </Link>

          <div aria-hidden="true" className="mx-2 my-1 h-px bg-white/10" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={pendingLogout}
            aria-busy={pendingLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm text-red-200/90 transition-colors duration-150 hover:bg-red-300/[0.08] hover:text-red-100 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/90"
          >
            {pendingLogout ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0 text-red-200/70" aria-hidden="true" />
            )}
            {pendingLogout ? "Signing out…" : "Logout"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
