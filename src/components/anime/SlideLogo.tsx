"use client";

import { useState } from "react";

/**
 * Renders the official TMDB logo (transparent image) and degrades gracefully:
 *
 *   1. `src` — the preferred logo URL (`logo.urlOriginal`).
 *   2. `fallbackSrc` — the secondary URL (`logo.url`, w500) on load error.
 *   3. `TitleHeading` — when no URL remains or every URL fails to load.
 *
 * The chain index advances exactly once per error and failed URLs are never
 * retried, so the loop is strictly bounded. A broken <img> is swapped out
 * immediately (never left flashing in the DOM), and the plain <img> element
 * is used because TMDB logos are frequently SVG/PNG with transparency, which
 * the next/image optimizer rejects without dangerouslyAllowSVG.
 */
export default function SlideLogo({
  src,
  fallbackSrc,
  title,
}: {
  src: string;
  fallbackSrc: string | null;
  title: string;
}) {
  const [failedCount, setFailedCount] = useState(0);
  const candidates = [src, ...(fallbackSrc ? [fallbackSrc] : [])];
  // Clamp guards against a candidates list shrinking between renders.
  const current = failedCount < candidates.length ? candidates[failedCount] : null;

  if (!current) {
    return <TitleHeading title={title} />;
  }

  return (
    // Fixed-height wrapper reserves the logo slot so the title below never
    // shifts while the transparent PNG loads or swaps to its fallback URL.
    <div className="flex h-32 items-center sm:h-38 lg:h-44">
      {/* eslint-disable-next-line @next/next/no-img-element -- TMDB logos may be SVG; fixed-size decorative asset with error fallback. */}
      <img
        key={current}
        src={current}
        alt={`${title} logo`}
        draggable={false}
        onError={() => setFailedCount((count) => count + 1)}
        className="max-h-full w-auto max-w-[min(580px,84vw)] object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

export function TitleHeading({ title }: { title: string }) {
  return (
    <h1 className="type-display max-w-2xl text-4xl text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] sm:text-5xl lg:text-[52px]">
      {title}
    </h1>
  );
}
