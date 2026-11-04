/**
 * JSON-LD structured-data string builders for OFFANIME public pages.
 *
 * These are pure, synchronous string builders imported only by server
 * components (layout + anime details page). `process.env` is read through
 * `src/lib/site.ts`, so they must not be imported from client components.
 *
 * Every block is built from real backend data only — no fabricated ratings,
 * reviews, cast, release dates, or organization addresses. Unavailable fields
 * are omitted, not invented. Output is safe to embed directly in HTML
 * (`</script>` sequences are escaped).
 */

import { siteUrl } from "@/lib/site";
import type { Anime } from "@/lib/types";

/** Safely serialize a value as JSON for embedding in a <script> tag. */
export function jsonEscape(value: unknown): string {
  const json = JSON.stringify(value);
  return json.replace(/<\/script>/gi, "<\\/script>");
}

/** Organization — only fields we can truthfully assert. */
export function organizationJsonLd(): string {
  const org: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "OFFANIME",
    url: siteUrl("/"),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: "cinematicotaku59@gmail.com",
      },
    ],
  };
  return `<script type="application/ld+json">${jsonEscape(org)}</script>`;
}

/** WebSite + SearchAction — OFFANIME has a real /search page accepting `q`. */
export function websiteJsonLd(): string {
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "OFFANIME",
    url: siteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl("/search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return `<script type="application/ld+json">${jsonEscape(website)}</script>`;
}

/** BreadcrumbList for anime details pages: Home > Anime library > {title}. */
export function breadcrumbJsonLd(animeTitle: string, animeUrlPath: string): string {
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl("/") },
      {
        "@type": "ListItem",
        position: 2,
        name: "Anime library",
        item: siteUrl("/anime"),
      },
      { "@type": "ListItem", position: 3, name: animeTitle, item: animeUrlPath },
    ],
  };
  return `<script type="application/ld+json">${jsonEscape(breadcrumb)}</script>`;
}

/** TVSeries for TV anime where the backend actually returns format "TV". */
export function tvSeriesJsonLd(anime: Anime, url: string): string | null {
  if ((anime.format || "").toUpperCase() !== "TV") return null;

  const series: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "TVSeries",
    name: bestTitle(anime),
    url,
  };

  const year = getYear(anime);
  if (year) series.releaseDate = `${year}-01-01`;

  const description = getDescription(anime);
  if (description) series.description = description;

  const images = anime.images ?? null;
  const image = images?.poster ?? images?.cover ?? images?.banner;
  if (image) series.image = image;

  const score = getScore(anime);
  if (score !== null) {
    series.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: score,
      bestRating: 10,
      worstRating: 0,
    };
  }

  return `<script type="application/ld+json">${jsonEscape(series)}</script>`;
}

/** Movie for actual movie pages (format "MOVIE"). */
export function movieJsonLd(anime: Anime, url: string): string | null {
  if ((anime.format || "").toUpperCase() !== "MOVIE") return null;

  const movie: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Movie",
    name: bestTitle(anime),
    url,
  };

  const year = getYear(anime);
  if (year) movie.releaseDate = `${year}-01-01`;

  const description = getDescription(anime);
  if (description) movie.description = description;

  const images = anime.images ?? null;
  const image = images?.poster ?? images?.cover ?? images?.banner;
  if (image) movie.image = image;

  const score = getScore(anime);
  if (score !== null) {
    movie.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: score,
      bestRating: 10,
      worstRating: 0,
    };
  }

  return `<script type="application/ld+json">${jsonEscape(movie)}</script>`;
}

/** Best available title (English → romaji/native → "Untitled"). */
function bestTitle(anime: Anime): string {
  if (anime.titleEnglish) return anime.titleEnglish;
  const title = anime.title;
  if (typeof title === "string") return title || "Untitled";
  if (title && typeof title === "object") {
    const record = title as unknown as Record<string, unknown>;
    for (const key of ["english", "userPreferred", "romaji", "native"]) {
      if (typeof record[key] === "string" && record[key].trim()) {
        return record[key] as string;
      }
    }
  }
  return "Untitled";
}

function getYear(anime: Anime): string | null {
  if (anime.seasonYear && anime.seasonYear > 1900 && anime.seasonYear < 2200) {
    return String(anime.seasonYear);
  }
  const start = String(anime.startDate ?? "").slice(0, 4);
  const y = Number.parseInt(start, 10);
  return Number.isFinite(y) && y > 1900 && y < 2200 ? start : null;
}

function getDescription(anime: Anime): string | null {
  if (typeof anime.description === "string" && anime.description.trim()) {
    return anime.description.trim().slice(0, 1600);
  }
  return null;
}

function getScore(anime: Anime): number | null {
  if (typeof anime.averageScore === "number" && Number.isFinite(anime.averageScore)) {
    return Math.round((anime.averageScore / 10) * 10) / 10;
  }
  return null;
}
