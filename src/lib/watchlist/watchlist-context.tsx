"use client";

/**
 * Global watchlist store (application-level context).
 *
 * ONE provider mounted once in the root layout next to AuthProvider; every
 * bookmark button, the details hero and the /watchlist page read the same
 * state — no per-card fetches ever happen, and duplicates are impossible
 * (identity = AniList ID, deduped at this boundary and upstream by the
 * contract's unique key).
 *
 * Behavior contract:
 *   - Reacts to the auth session: sign-in loads the user's list ONCE per
 *     identity (in-flight dedupe), sign-out/sign-in-as another account
 *     clears and refetches — two users' lists can never mix. A response
 *     that outlives an identity switch is dropped (stale-response guard).
 *   - add/remove are OPTIMISTIC: the icon flips immediately, the change is
 *     persisted through the backend, and any failure reverts exactly that
 *     change and reports the reason (the UI maps it to copy/toasts).
 *   - Guests: the caller saves the attempted title as a transient intent
 *     (sessionStorage, see pending.ts) and redirects to the existing login
 *     flow; on the next unauthenticated→authenticated transition this
 *     provider completes the pending add automatically and exposes it via
 *     `completedIntent` for a one-shot success notification.
 *   - Persistence is the BACKEND only (`/api/watchlist`, RLS-scoped) —
 *     browser storage never holds the list. Failures degrade to `unavailable`
 *     and toggles revert with an honest reason instead of pretending to work.
 *     The backend stores only IDs + timestamps: display metadata rides on
 *     optimistic entries and is hydrated elsewhere (see WatchlistCard).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth/auth-context";
import {
  addWatchlistEntry,
  listWatchlist,
  removeWatchlistEntry,
} from "./api-client";
import {
  clearPendingWatchlistIntent,
  consumePendingWatchlistIntent,
} from "./pending";
import type {
  WatchlistEntry,
  WatchlistEntryInput,
  WatchlistStatus,
} from "./types";

export type WatchlistMutationResult =
  | { ok: true }
  | { ok: false; reason: "session-expired" | "unavailable" | "rate-limited" | "error" };

export interface WatchlistContextValue {
  /** `idle` while signed out; see types.ts for the lifecycle. */
  status: WatchlistStatus;
  /** Saved titles for the CURRENT user, newest first. Shared by all UI. */
  items: WatchlistEntry[];
  /** Identity the `items` currently describe (null when signed out). */
  userId: string | null;
  isSaved(animeId: number): boolean;
  /** Optimistic add (idempotent — an already-saved ID resolves immediately). */
  add(entry: WatchlistEntryInput): Promise<WatchlistMutationResult>;
  /** Optimistic removal by AniList ID (the backend's animeId). */
  remove(animeId: number): Promise<WatchlistMutationResult>;
  /** Manual refetch (e.g. the watchlist page's retry button). */
  reload(): void;
  /**
   * The title auto-saved right after sign-in (a completed guest intent).
   * Consumed-once signal for success feedback; null otherwise.
   */
  completedIntent: WatchlistEntryInput | null;
  /** Acknowledge the signal after surfacing its feedback (resets to null). */
  clearCompletedIntent(): void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

/**
 * Raw context handle — exported for dev-only visual harnesses and tests
 * (mirrors the auth-context pattern). Application code uses `useWatchlist`.
 */
export { WatchlistContext };

/** Sort helper: newest first (addedAt desc — the server's saved instant). */
function sortItems(items: WatchlistEntry[]): WatchlistEntry[] {
  return [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const { user, status: authStatus } = useAuth();
  const [items, setItems] = useState<WatchlistEntry[]>([]);
  const [status, setStatus] = useState<WatchlistStatus>("idle");
  const [listUserId, setListUserId] = useState<string | null>(null);
  const [completedIntent, setCompletedIntent] = useState<WatchlistEntryInput | null>(null);

  /** Mirror of `items` for pure synchronous reads (StrictMode-safe). */
  const itemsRef = useRef<WatchlistEntry[]>([]);
  /** Mirror of the identity `items` describe — readable after async gaps. */
  const listUserIdRef = useRef<string | null>(null);
  const applyItems = useCallback((next: WatchlistEntry[]) => {
    const sorted = sortItems(next);
    itemsRef.current = sorted;
    setItems(sorted);
  }, []);

  // --- session lifecycle --------------------------------------------------

  /** In-flight list load, deduped per identity (one network call per login). */
  const loadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  /** Monotonic guard: results apply only if no newer session change happened. */
  const generationRef = useRef(0);
  /** Identity whose guest intent was already completed (once per sign-in). */
  const intentConsumedForRef = useRef<string | null>(null);
  /** Previous resolved identity — distinguishes real sign-out from "restoring". */
  const prevUserIdRef = useRef<string | null>(null);

  const loadForUser = useCallback(
    (userId: string, { force = false }: { force?: boolean } = {}): Promise<void> => {
      if (loadRef.current?.userId === userId && !force) {
        return loadRef.current.promise;
      }
      const generation = ++generationRef.current;
      loadRef.current = { userId, promise: (async () => {
        setStatus("loading");
        listUserIdRef.current = userId;
        setListUserId(userId);
        const result = await listWatchlist();
        // Identity switched mid-flight (logout / sign-in-as): drop the stale reply.
        if (generation !== generationRef.current) return;
        if (result.kind === "items") {
          applyItems(result.items);
          setStatus("ready");
        } else if (result.reason === "session-expired") {
          applyItems([]);
          setStatus("expired");
        } else if (result.reason === "unavailable") {
          applyItems([]);
          setStatus("unavailable");
        } else {
          // rate-limited / error: the list could not be PROVEN — the page
          // shows the honest retry panel, never a possibly-wrong empty view.
          applyItems([]);
          setStatus("unavailable");
        }
      })() };
      return loadRef.current.promise;
    },
    [applyItems],
  );

  useEffect(() => {
    // Session restore in flight: `user` is transiently null on EVERY fresh
    // load — this is not a sign-out. Purging here would erase a pending
    // guest intent exactly on the page that is about to complete it.
    if (authStatus === "loading") return;

    const userId = user?.id ?? null;

    if (!userId) {
      const wasSignedIn = prevUserIdRef.current !== null;
      prevUserIdRef.current = null;
      // Signed out (unavailable auth is treated as guest): purge everything
      // so one user's list can never leak into another's session.
      generationRef.current += 1;
      loadRef.current = null;
      intentConsumedForRef.current = null;
      applyItems([]);
      setStatus("idle");
      listUserIdRef.current = null;
      setListUserId(null);
      // ONLY a real sign-out drops a pending intent. A guest mid-flow keeps
      // theirs: it is completed by the sign-in that follows (product rule:
      // the attempted save is never lost).
      if (wasSignedIn) clearPendingWatchlistIntent();
      return;
    }

    prevUserIdRef.current = userId;

    if (listUserId === userId && (status === "loading" || status === "ready" || status === "unavailable")) {
      return; // already loaded / loading for exactly this identity
    }

    void loadForUser(userId).then(() => {
      // Completion runs once per identity: a guest bookmark that was
      // interrupted by the login redirect is finished here. The backend
      // add is authoritative; the local mirror updates only on success.
      if (intentConsumedForRef.current === userId) return;
      intentConsumedForRef.current = userId;
      const intent = consumePendingWatchlistIntent();
      if (!intent) return;
      void (async () => {
        const result = await addWatchlistEntry(intent);
        if (!result.ok) return; // intent already cleared; the guest can re-click
        // Identity check (ref mirror): the list may have switched identity
        // during the async gap — never apply a completed intent to the
        // wrong user's session.
        if (listUserIdRef.current !== userId) return;
        const entry: WatchlistEntry = {
          ...intent,
          addedAt: result.addedAt ?? new Date().toISOString(),
        };
        if (!itemsRef.current.some((item) => item.animeId === entry.animeId)) {
          applyItems([entry, ...itemsRef.current]);
        }
        setCompletedIntent({ ...intent });
      })();
    });
    // Items mirror refs are stable; `listUserId`/`status` are excluded — the
    // identity comparison above is the trigger, and transient nulls during
    // restore must not restart the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authStatus, applyItems, loadForUser]);

  // --- mutations (optimistic, deduped per AniList ID) ------------------------

  const inFlightRef = useRef(new Map<number, Promise<WatchlistMutationResult>>());

  const add = useCallback(
    (entry: WatchlistEntryInput): Promise<WatchlistMutationResult> => {
      const existing = inFlightRef.current.get(entry.animeId);
      if (existing) return existing;

      const operation = (async (): Promise<WatchlistMutationResult> => {
        // Idempotent: already saved → success without another network call.
        if (itemsRef.current.some((item) => item.animeId === entry.animeId)) {
          return { ok: true };
        }
        // Optimistic insert FIRST (the icon flips on the same click); the
        // local timestamp is provisional — a first save adopts the SERVER's
        // addedAt so order matches every other device.
        const optimistic: WatchlistEntry = { ...entry, addedAt: new Date().toISOString() };
        applyItems([optimistic, ...itemsRef.current]);

        const result = await addWatchlistEntry(entry);
        if (!result.ok) {
          // Revert exactly this optimistic insert (later clicks on other
          // titles are independent and stay).
          if (itemsRef.current.some((item) => item.animeId === entry.animeId)) {
            // Only remove when the item on screen IS our optimistic one.
            if (itemsRef.current.find((item) => item.animeId === entry.animeId) === optimistic) {
              applyItems(itemsRef.current.filter((item) => item !== optimistic));
            } else {
              applyItems(itemsRef.current.filter((item) => item.animeId !== entry.animeId));
            }
          }
          return { ok: false, reason: result.reason };
        }
        // First add: the backend's addedAt is authoritative — swap the
        // placeholder timestamp so cross-device ordering is consistent
        // (ref-mirror identity check keeps it on this user's view).
        if (result.ok && result.addedAt) {
          const serverAddedAt: string = result.addedAt;
          if (optimistic === itemsRef.current.find((item) => item.animeId === entry.animeId)) {
            applyItems(
              itemsRef.current.map((item) =>
                item === optimistic ? { ...item, addedAt: serverAddedAt } : item,
              ),
            );
          }
        }
        return { ok: true };
      })();

      inFlightRef.current.set(entry.animeId, operation);
      void operation.finally(() => {
        inFlightRef.current.delete(entry.animeId);
      });
      return operation;
    },
    [applyItems],
  );

  const remove = useCallback(
    (animeId: number): Promise<WatchlistMutationResult> => {
      const existing = inFlightRef.current.get(animeId);
      if (existing) return existing;

      const operation = (async (): Promise<WatchlistMutationResult> => {
        const index = itemsRef.current.findIndex((item) => item.animeId === animeId);
        if (index === -1) return { ok: true }; // already gone — idempotent
        const removed = itemsRef.current[index];
        // Optimistic removal FIRST.
        applyItems(itemsRef.current.filter((item) => item.animeId !== animeId));

        const result = await removeWatchlistEntry(animeId);
        if (!result.ok) {
          // Revert: restore the exact entry; the sort keeps addedAt order.
          if (!itemsRef.current.some((item) => item.animeId === animeId)) {
            applyItems([...itemsRef.current, removed]);
          }
          return { ok: false, reason: result.reason };
        }
        return { ok: true };
      })();

      inFlightRef.current.set(animeId, operation);
      void operation.finally(() => {
        inFlightRef.current.delete(animeId);
      });
      return operation;
    },
    [applyItems],
  );

  const isSaved = useCallback(
    (animeId: number) => items.some((item) => item.animeId === animeId),
    [items],
  );

  const reload = useCallback(() => {
    if (!user?.id) return;
    loadRef.current = null;
    void loadForUser(user.id, { force: true });
  }, [user?.id, loadForUser]);

  const clearCompletedIntent = useCallback(() => {
    setCompletedIntent(null);
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      status,
      items,
      userId: listUserId,
      isSaved,
      add,
      remove,
      reload,
      completedIntent,
      clearCompletedIntent,
    }),
    [status, items, listUserId, isSaved, add, remove, reload, completedIntent, clearCompletedIntent],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

/**
 * Single access point for the shared watchlist state. Must be inside
 * WatchlistProvider (mounted in the root layout, inside AuthProvider).
 */
export function useWatchlist(): WatchlistContextValue {
  const context = useContext(WatchlistContext);
  if (!context) {
    throw new Error("useWatchlist must be used within the WatchlistProvider (mounted in the root layout).");
  }
  return context;
}
