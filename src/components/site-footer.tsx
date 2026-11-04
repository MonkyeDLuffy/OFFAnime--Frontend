import Image from "next/image";
import Link from "next/link";
import { Mail } from "lucide-react";
import FooterYear from "./footer-year";
import {
  HOSTING_DISCLAIMER,
  SITE_EMAIL,
  SITE_NAME,
  SITE_TAGLINE,
} from "@/lib/site";

// The decorative artwork ships at the project root and is intentionally NOT
// moved or renamed — a static import hashes it into the build output
// (500×500 PNG cutout with a real alpha channel, blended via .footer-art).
import footerArt from "../../open-world-kawaii-anime-with-adorable-chibi-characters-sticker-designs-digital-downloads_1142283-447039.png";

/** The project's real routes, in the order shown in the center column. */
const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/anime", label: "Anime" },
  { href: "/contact", label: "Contact" },
  { href: "/dmca", label: "DMCA Policy" },
  { href: "/terms", label: "Terms of Service" },
] as const;

/**
 * Global site footer, mounted once in the root layout so it appears on every
 * page without per-page duplication (the custom 404 included).
 *
 * Compact three-column layout (single row on desktop, stacked on mobile):
 *
 *   1. Left   — OFFANIME wordmark, short description, copyright year.
 *   2. Center — the five nav links (real routes) as one vertical list with
 *               the public email as a liquid-glass mailto button beneath.
 *   3. Right  — the chibi PNG cutout, sized to complement (not dominate),
 *               sitting on the dark background over a soft glow with an
 *               alpha-shaped drop shadow (.footer-art). Decorative only
 *               (alt=""), aspect preserved via next/image, gently floating,
 *               motion-safe only.
 *
 * Beneath the columns, the site's hosting disclaimer (reproduced verbatim
 * from src/lib/site.ts — single source of truth) runs as a full-width band
 * separated by a subtle top border.
 *
 * The footer is transparent over the page's #050507 background with a faint
 * top-edge glow and hairline separator, so it stays quiet while trailers
 * play behind it (the ambient backdrop is painted below all content).
 */
export default function SiteFooter() {
  return (
    <footer className="relative mt-12 border-t border-white/10">
      {/* Faint cool glow rising from the top edge, mirroring the section
          heading treatment of the home carousels. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_130%_at_50%_0%,rgba(140,140,190,0.07),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-12 sm:px-10 lg:px-16 xl:px-24">
        {/* Three columns — brand | navigation + contact | illustration */}
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-8">
          {/* 1 — Branding, description, copyright (left) */}
          <div className="max-w-sm">
            <p className="type-display text-[30px] sm:text-40px text-white">
              OFF<span className="text-white/55">ANIME</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              {SITE_TAGLINE}
            </p>
            <p className="mt-4 text-xs text-white/40">
              © <FooterYear /> {SITE_NAME}. All rights reserved.
            </p>
          </div>

          {/* 2 — Navigation + contact (center) */}
          <div className="md:justify-self-center">
            <nav aria-label="Footer">
              <p className="type-label text-xs uppercase text-white/40">
                Navigate
              </p>
              <ul className="mt-4 space-y-2.5">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="type-label text-[15px] text-white/65 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/90"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="glass-btn glass-btn--dark type-label mt-6 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/90"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {SITE_EMAIL}
            </a>
          </div>

          {/* 3 — Decorative illustration (right). A true PNG cutout blended
              with light, not a frame; sized to complement the columns and
              never stretched — next/image keeps the intrinsic square. */}
          <div className="relative flex justify-center md:justify-end">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_55%,rgba(150,140,220,0.16),transparent_70%)]"
            />
            <Image
              src={footerArt}
              alt=""
              aria-hidden="true"
              sizes="(min-width: 768px) 280px, 60vw"
              className="footer-art relative h-auto w-[200px] max-w-[60vw] select-none object-contain md:w-[240px] lg:w-[280px]"
            />
          </div>
        </div>

        {/* Disclaimer — verbatim (see src/lib/site.ts), full-width band with
            a subtle top border. */}
        <div className="mt-10 border-t border-white/10 pt-5">
          <p className="text-xs leading-relaxed text-white/45">
            {HOSTING_DISCLAIMER}
          </p>
        </div>
      </div>
    </footer>
  );
}
