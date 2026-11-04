"use client";

/**
 * Minimal, premium toast system for auth flows (PART 11 — inline validation
 * plus toast messages). One aria-live viewport in the root layout; toasts
 * are stackable, self-dismiss after ~4 seconds and slide/settle on the
 * site's shared cinematic curve (motion-safe only — the global
 * `prefers-reduced-motion` block collapses every transition).
 *
 * Deliberately dependency-free and centered on auth: no state libs, no
 * animation lib — a few surface classes live in globals.css.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
  tone: ToastTone;
  message: string;
  /** Override the default 4200ms auto-dismiss (ms). Minimum 1200. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

export interface ToastApi {
  toast(options: ToastOptions): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CircleCheck className="mt-px h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />,
  error: <CircleAlert className="mt-px h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />,
  info: <Info className="mt-px h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setItems((current) => [
      // Newest on top of the stack; the viewport animates them in.
      ...current.slice(-3),
      { ...options, id },
    ]);
    const duration = Math.max(options.durationMs ?? 4200, 1200);
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, duration);
  }, []);

  const context = useMemo<ToastApi>(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={context}>
      {children}
      {/* Viewport — click-through around the toasts; polite for SR users.
          Reversed stacking (columns) so the newest renders last visually. */}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className="toast-in pointer-events-auto flex max-w-[min(92vw,440px)] items-start gap-2.5 rounded-2xl px-4 py-3 text-sm"
          >
            {TONE_ICON[item.tone]}
            <span className="min-w-0 break-words leading-relaxed text-white/90">
              {item.message}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within the ToastProvider (root layout).");
  }
  return context;
}
