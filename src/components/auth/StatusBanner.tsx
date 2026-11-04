"use client";

/**
 * Inline status banner for auth forms (PART 11). Directly associated with
 * what happened: red for definitive failures, amber for throttling
 * back-offs, neutral for provider availability notices. Always a smart
 * `role="alert"` so screen readers announce it inline, never via toast only.
 */

import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

export type BannerTone = "error" | "warning" | "notice";

const TONE_CLASS: Record<BannerTone, string> = {
  error: "border-red-400/30 bg-red-400/[0.08] text-red-100",
  warning: "border-amber-300/30 bg-amber-300/[0.08] text-amber-100",
  notice: "border-white/20 bg-white/[0.06] text-white/85",
};

const ICON_CLASS: Record<BannerTone, string> = {
  error: "text-red-300",
  warning: "text-amber-200",
  notice: "text-white/60",
};

export default function StatusBanner({
  tone = "error",
  title,
  children,
}: {
  tone?: BannerTone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${TONE_CLASS[tone]}`}
    >
      <p className="flex items-start gap-2 font-medium">
        <CircleAlert className={`mt-0.5 h-4 w-4 shrink-0 ${ICON_CLASS[tone]}`} aria-hidden="true" />
        {title}
      </p>
      {children ? <div className="mt-1.5 pl-6 text-[13px] opacity-85">{children}</div> : null}
    </div>
  );
}
