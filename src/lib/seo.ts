/**
 * Shared SEO metadata builders used across public pages.
 *
 * All canonical URLs are absolute HTTPS on the production host
 * (`src/lib/site.ts`). Titles/descriptions come from real backend data
 * only — nothing is fabricated or keyword-stuffed.
 */

import type { Metadata } from "next";
import { siteUrl, animeUrl } from "@/lib/site";
import {
  getDisplayTitle,
  getDisplayDescription,
  getNativeTitle,
  getDisplayYear,
  getDisplayFormat,
} from "@/lib/anime";
import type { Anime } from "@/lib/types";

/**
 * Build the full Metadata object for an anime details page from the actual
 * backend `Anime` payload.
 *
 * - title: English → romaji/native → "Untitled" (unique per anime).
 *   - description: cleaned synopsis, never fabricated.
 *   - canonical URL: `/anime/:anilistId` (AniList ID, never MAL).
 *   - Open Graph + Twitter card metadata with the best available poster.
 *   - robots: index,follow (public, indexable details pages).
 */
export function animeDetailsMetadata(anime: Anime): Metadata {
  const title = getDisplayTitle(anime);
  const description = getDisplayDescription(anime);
  const year = getDisplayYear(anime);
  const format = getDisplayFormat(anime);
  const nativeTitle = getNativeTitle(anime);
  const url = animeUrl(anime.anilistId);

  // Subtitle line for the HTML <title>, e.g. "Attack on Titan (2013) · TV · OFFANIME".
  const metaBits = [year, format].filter(Boolean).join(" · ");
  const templateTitle = metaBits ? `${title} (${metaBits}) · OFFANIME` : `${title} · OFFANIME`;

  const ogDescription =
    description ?? `${title} ${year ? `(${year}) ` : ""}stream on OFFANIME.`;
  const twitterDescription =
    description ??
    `Watch ${title}${year ? ` (${year})` : ""} on OFFANIME — a premium anime streaming experience.`;

  const images = anime.images ?? null;
  const ogImage = images?.poster ?? images?.cover ?? images?.banner ?? undefined;

  return {
    title: templateTitle,
    description: description ? description.slice(0, 200) : undefined,
    authors: [{ name: "OFFANIME" }],
    creator: "OFFANIME",
    publisher: "OFFANIME",
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    openGraph: {
      title,
      description: ogDescription,
      url,
      siteName: "OFFANIME",
      type: "website",
      locale: "en_US",
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
      ...(year ? { publishedTime: new Date(`${year}-01-01`).toISOString() } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: twitterDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
      creator: "@offanime",
    },
    alternates: {
      canonical: url,
    },
    ...(nativeTitle ? { other: { "og:anime:native_title": nativeTitle } } : {}),
  };
}

/** Homepage metadata. */
export function homepageMetadata(): Metadata {
  return {
    title: "Watch Anime Online — OFFANIME",
    description:
      "Stream trending, popular and seasonal anime in a cinematic, premium experience. All your favorite anime in one glass-smooth interface.",
    authors: [{ name: "OFFANIME" }],
    creator: "OFFANIME",
    publisher: "OFFANIME",
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    openGraph: {
      title: "Watch Anime Online — OFFANIME",
      description:
        "Stream trending, popular and seasonal anime on OFFANIME — a cinematic, premium anime streaming experience.",
      url: siteUrl("/"),
      siteName: "OFFANIME",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: "Watch Anime Online — OFFANIME",
      description:
        "Stream trending, popular and seasonal anime on OFFANIME — a cinematic, premium anime streaming experience.",
    },
    alternates: { canonical: siteUrl("/") },
  };
}

/** Anime landing page metadata. */
export function animeLandingMetadata(): Metadata {
  return {
    title: "Anime Library — OFFANIME",
    description:
      "Browse the OFFANIME anime library — trending hits, seasonal favorites and all-time classics, each with full details and streaming options.",
    authors: [{ name: "OFFANIME" }],
    creator: "OFFANIME",
    publisher: "OFFANIME",
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
    },
    openGraph: {
      title: "Anime Library — OFFANIME",
      description:
        "Browse the OFFANIME anime library — trending hits, seasonal favorites and all-time classics.",
      url: siteUrl("/anime"),
      siteName: "OFFANIME",
      type: "website",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: "Anime Library — OFFANIME",
      description:
        "Browse the OFFANIME anime library — trending hits, seasonal favorites and all-time classics.",
    },
    alternates: { canonical: siteUrl("/anime") },
  };
}
