"use client";

/**
 * Shared Liquid Glass card surface for the four auth pages
 * (login / signup / forgot / reset). One skin, per-page content: dark
 * cinematic page glow, centered frosted panel, OFFANIME brand block, Fornire
 * display heading (.type-display / .type-label — weight pinned to 400 by
 * globals.css) and a back-to-anime link. Layout sizes stay per-page; this
 * component owns only the shared shell.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export interface AuthCardProps {
  /** Small branch label above the heading (e.g. "Account access"). */
  eyebrow: string;
  title: string;
  /** Optional supporting sentence under the title. */
  lead?: string;
  children: ReactNode;
  /** Extra link row rendered under the panel (links to other auth pages). */
  footer?: ReactNode;
  /** Distinct max-width for wide forms; defaults to md (max-w-md). */
  widthClass?: string;
}

export default function AuthCard({
  eyebrow,
  title,
  lead,
  children,
  footer,
  widthClass = "max-w-md",
}: AuthCardProps) {
  return (
    <main className="relative min-h-[100svh]">
      {/* Cinematic top glow — same treatment as the legal pages. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(58%_100%_at_50%_0%,rgba(140,140,190,0.10),transparent_72%)]"
      />

      <div className="relative mx-auto flex min-h-[100svh] w-full flex-col items-center justify-center px-4 pb-24 pt-28 sm:px-6 sm:pb-28 sm:pt-32">
        <div className={`w-full ${widthClass}`}>
          <div className="glass-panel rounded-3xl p-6 sm:p-9">
            <div className="flex items-center justify-between gap-4">
              <Link
                href="/anime"
                aria-label="OFFAnime — home"
                className="font-heading text-[20px] tracking-[0.04em] text-white transition-opacity duration-200 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
              >
                OFF
              </Link>
              <p className="type-label text-[11px] uppercase text-white/45">{eyebrow}</p>
            </div>

            <h1 className="type-display mt-6 text-[26px] leading-tight text-white sm:text-3xl">
              {title}
            </h1>
            {lead ? <p className="mt-2.5 text-sm leading-relaxed text-white/60">{lead}</p> : null}

            <div className="mt-7">{children}</div>
          </div>

          {footer ? <div className="mt-6 text-center text-sm text-white/55">{footer}</div> : null}

          <div className="mt-8 text-center">
            <Link
              href="/anime"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white/45 transition-colors hover:text-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to anime
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
