/**
 * Site-wide constants shared by the footer and the static informational
 * pages (Contact, DMCA, Terms). Keeping them in one module guarantees the
 * disclaimer and contact address are reproduced identically everywhere they
 * appear.
 */

/** Brand name as written in the footer wordmark and disclaimer. */
export const SITE_NAME = "OFFANIME";

/** The single public contact/copyright address. */
export const SITE_EMAIL = "cinematicotaku59@gmail.com";

/** Short brand line used under the footer wordmark. */
export const SITE_TAGLINE =
  "Stream your favorite anime in a cinematic, premium experience — trending hits, seasonal favorites and all-time classics behind one glass-smooth interface.";

/**
 * The site's hosting disclaimer, reproduced verbatim in the footer (and
 * referenced by the DMCA / Terms pages). Do not reword — it is the site's
 * stated legal position.
 */
export const HOSTING_DISCLAIMER =
  "OFFANIME does not host any files, it merely pulls streams from 3rd party services. Legal issues should be taken up with the file hosts and providers. OFFANIME is not responsible for any media files shown by the video providers.";

/**
 * Public production website URL used for canonical URLs, sitemap entries and
 * Open Graph images. Configured via the `SITE_URL` server environment
 * variable; defaults to the production domain `https://offanime.cc`.
 *
 * This is a server-only value — it is never exposed to the browser. Do not
 * create a `NEXT_PUBLIC_` variant of it.
 */
export function getSiteUrl(): string {
  return (
    process.env.SITE_URL?.trim().replace(/\/+$/, "") ?? "https://offanime.cc"
  );
}

/** Canonical URL for a path, always absolute HTTPS on the production host. */
export function siteUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${getSiteUrl()}/${normalized}`;
}

/** Canonical anime details URL keyed by AniList ID. */
export function animeUrl(anilistId: number): string {
  return siteUrl(`/anime/${anilistId}`);
}
