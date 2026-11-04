import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AnimeDetailsHero from "@/components/anime/AnimeDetailsHero";
import EpisodesCarousel from "@/components/anime/EpisodesCarousel";
import SeasonsCarousel from "@/components/anime/SeasonsCarousel";
import { HeroErrorState } from "@/components/anime/HeroStates";
import {
  buildDetailsHeroSlide,
  getAnimeTrailerSource,
} from "@/lib/anime";
import { getAnimeDetails, getAnimeEpisodes, getHomeFeed, getTmdbVisuals } from "@/lib/api";
import type { EpisodesResponse, TrailerSource } from "@/lib/types";
import { animeDetailsMetadata } from "@/lib/seo";
import { animeUrl } from "@/lib/site";
import {
  breadcrumbJsonLd,
  movieJsonLd,
  tvSeriesJsonLd,
} from "@/lib/structured-data";
import { getDisplayTitle } from "@/lib/anime";
import RecommendedCarousel from "@/components/anime/RecommendedCarousel";

/**
 * Anime details page `/anime/[id]` (`id` = AniList ID — the exact target the
 * homepage hero's Play Now / Info buttons and the carousel popups link to).
 *
 * Data — three server-side reads, each served from the Next.js Data Cache
 * shared with the rest of the site (no duplicated upstream calls):
 *   1. `/api/details/:id`  · canonical payload (title, description, images,
 *      status, format, episodes, duration) — cached 1h (backend LONG TTL).
 *   2. `/api/tmdb/:id`     · banner/backdrop/logo enrichment — cached 24h,
 *      retried once on transport failure. Failure here is non-fatal: the
 *      banner falls back down the AniList chain, the logo falls back to the
 *      title heading.
 *   3. `/api/home`         · the SAME cached feed the homepage renders. The
 *      details payload carries no trailer, so the matching card's `trailer`
 *      record supplies the background preview. Feed failure or an
 *      unlisted/untrailered anime simply hides the Watch Trailer control.
 *
 * A 404 (or bad-ID 400) upstream answer renders the site's custom not-found
 * page; any other backend failure renders the shared cinematic error state.
 * The page revalidates every 60s, matching the backend's SHORT feed TTL.
 */

export const revalidate = 60;

/** AniList IDs are positive integers; reject everything else up front. */
const ANILIST_ID_PATTERN = /^\d{1,9}$/;

function parseAnilistId(raw: string): number | null {
  return ANILIST_ID_PATTERN.test(raw) ? Number.parseInt(raw, 10) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const anilistId = parseAnilistId(id);
  if (anilistId === null) return {};

  const details = await getAnimeDetails(anilistId);
  if (!details.ok) return {};

  return animeDetailsMetadata(details.data);
}

export default async function AnimeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const anilistId = parseAnilistId(id);
  if (anilistId === null) notFound();

  const details = await getAnimeDetails(anilistId);
  if (!details.ok) {
    // Definitive upstream "no such anime" answers render the custom 404;
    // transport/timeout/5xx failures render the shared cinematic error state.
    if (
      details.kind === "http" &&
      (details.status === 404 || details.status === 400)
    ) {
      notFound();
    }
    return <HeroErrorState kind={details.kind} status={details.status} />;
  }

  const anime = details.data;

  const canonicalUrl = animeUrl(anime.anilistId);

  // Page-specific JSON-LD structured data (server-rendered, real backend data).
  // Organization + WebSite are emitted globally by the root layout.
  const jsonLd = [
    breadcrumbJsonLd(getDisplayTitle(anime), canonicalUrl),
    tvSeriesJsonLd(anime, canonicalUrl),
    movieJsonLd(anime, canonicalUrl),
  ].filter(Boolean).join("");

  // Banner/logo enrichment (24h cache; failure → AniList banner fallback
  // chain, logo → title heading — never fatal).
  const visuals = await getTmdbVisuals(anilistId);
  const slide = buildDetailsHeroSlide(anime, visuals.ok ? visuals.data : null);

  // Episodes data (1h cache; failure is non-fatal — section handles it).
  const episodesResult = await getAnimeEpisodes(anilistId);
  const episodesData: EpisodesResponse | null = episodesResult.ok ? episodesResult.data : null;

  // Recommended Anime + Seasons are fetched CLIENT-SIDE through the same-
  // origin proxy (`GET /api/recommendations/:anilistId`,
  // `GET /api/seasons/:anilistId`) inside their carousel components.
  // The details payload carries no recommendations key, so nothing is read
  // from it here. `anime.seasonYear` feeds only the Seasons section's
  // "current season" year chip (the seasons endpoint's self entry has none).
  return (
    <main>
      <div
        dangerouslySetInnerHTML={{ __html: jsonLd }}
        aria-hidden="true"
      />
      <AnimeDetailsHero
        slide={slide}
        info={anime}
        trailer={await findHomeCardTrailer(anilistId)}
      />
      <EpisodesCarousel
        episodes={episodesData?.episodes ?? null}
        isLoading={false}
        error={!episodesResult.ok}
        anilistId={anilistId}
      />
      <SeasonsCarousel
        anilistId={anilistId}
        currentSeasonYear={anime.seasonYear}
      />
      <RecommendedCarousel
        anilistId={anilistId}
      />
    </main>
  );
}

/**
 * Trailer for the background preview: the `/api/details/:id` payload carries
 * no trailer field, so the matching card is looked up in the (already cached)
 * `/api/home` feed — trending first, then popular, seasonal and top-rated.
 * Returns null when the feed is unavailable or the anime has no resolvable
 * trailer; the Watch Trailer control simply stays hidden.
 */
async function findHomeCardTrailer(
  anilistId: number,
): Promise<TrailerSource | null> {
  const feed = await getHomeFeed();
  if (!feed.ok) return null;

  const sections = [
    feed.data.trending,
    feed.data.popular,
    feed.data.seasonal,
    feed.data.topRated,
  ];
  for (const section of sections) {
    if (!Array.isArray(section)) continue;
    for (const card of section) {
      if (card && typeof card === "object" && card.anilistId === anilistId) {
        const source = getAnimeTrailerSource(card);
        if (source) return source;
      }
    }
  }
  return null;
}
