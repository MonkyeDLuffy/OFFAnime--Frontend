import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Compass, Home } from "lucide-react";
import BackButton from "@/components/back-button";

export const metadata: Metadata = {
  title: "Page Not Found",
};

/**
 * Deterministic pseudo-random star field for the 404 backdrop — computed
 * from the star's index (golden-angle spread) rather than Math.random, so
 * server and client render identical output with zero hydration drift.
 */
const STARS = Array.from({ length: 16 }, (_, i) => {
  const angle = i * 137.508; // golden angle — even, non-repeating spread
  const radius = 22 + ((i * 53) % 60); // 22–82% of the half-viewport
  const rad = (angle * Math.PI) / 180;
  return {
    left: 50 + Math.cos(rad) * radius,
    top: 55 + Math.sin(rad) * (radius * 0.72),
    size: 2 + (i % 3),
    duration: 7 + ((i * 3) % 8),
    delay: -((i * 1.7) % 9),
    dx: ((i % 5) - 2) * 12,
  };
});

/**
 * Global not-found page (app/not-found.tsx) — Next.js renders it for any
 * unmatched route, replacing the generic framework error.
 *
 * Theme: an "uncharted world" — the visitor has stepped off the map. A slow
 * rotating portal arc and a drifting star field frame the huge outlined 404
 * (the same hollow-stroke display style as the home "TOP 10" type), all
 * pure CSS, GPU-cheap, and fully disabled under prefers-reduced-motion
 * (explicit guards in globals.css). The composition reuses the site's
 * liquid-glass button skin for both actions.
 */
export default function NotFound() {
  return (
    <section className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center">
      {/* Drifting star field (decorative, deterministic, reduced-motion safe) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="nf-star absolute rounded-full bg-white"
            style={
              {
                left: `${star.left}%`,
                top: `${star.top}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                "--nf-dur": `${star.duration}s`,
                "--nf-delay": `${star.delay}s`,
                "--nf-dx": `${star.dx}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Portal rings behind the 404 type */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgba(140,140,220,0.16),transparent_70%)]" />
        <div className="nf-halo absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
        <div className="nf-portal-ring nf-portal-spin absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <div className="nf-portal-ring nf-portal-spin absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full [animation-direction:reverse] [animation-duration:22s]" />
        <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
      </div>

      <div className="relative flex flex-col items-center">
        <Compass
          className="h-8 w-8 text-white/45"
          aria-hidden="true"
        />
        <span className="sr-only">Error 404 — page not found.</span>
        {/* Same hollow-stroke display type as the home "TOP 10" heading. */}
        <p
          aria-hidden="true"
          className="top10-title mt-4 text-[26vw] font-black leading-none tracking-[-0.02em] sm:text-[11rem]"
        >
          404
        </p>
        <h1 className="type-display mt-3 max-w-xl text-[30px] sm:text-36px text-white">
          Looks like you&apos;ve wandered into an uncharted world.
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60 sm:text-base">
          The page you&apos;re looking for doesn&apos;t exist — it may have
          been moved, renamed, or it never existed at all. The portal back to
          safe ground is right here.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/"
            className="glass-btn glass-btn--bright type-label inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-sm text-[#0b0b0f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Back to Home
          </Link>
          <BackButton
            className="glass-btn glass-btn--dark type-label inline-flex items-center gap-2.5 rounded-full px-6 py-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go Back
          </BackButton>
        </div>
      </div>
    </section>
  );
}
