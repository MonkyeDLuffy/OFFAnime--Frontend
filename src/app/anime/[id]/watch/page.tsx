import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WatchPage from "@/components/anime/WatchPage";
import { getAnimeDetails, getAnimeEpisodes } from "@/lib/api";
import { getDisplayTitle } from "@/lib/anime";
import type { AnimeEpisode } from "@/lib/types";

/** AniList IDs are positive integers; reject everything else up front. */
const ANILIST_ID_PATTERN = /^\d{1,9}$/;

function parseAnilistId(raw: string): number | null {
  return ANILIST_ID_PATTERN.test(raw) ? Number.parseInt(raw, 10) : null;
}

/** First episode is the default when none is requested. */
const DEFAULT_EPISODE = 1;
/** Subtitled audio is the default language when none is requested. */
const DEFAULT_LANGUAGE = "sub";

export const revalidate = 0;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string; language?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const anilistId = parseAnilistId(id);
  if (anilistId === null) return {};

  const details = await getAnimeDetails(anilistId);
  if (!details.ok) return {};

  const { ep = String(DEFAULT_EPISODE), language = DEFAULT_LANGUAGE } =
    await searchParams;
  const episode = Number.parseInt(ep, 10) || DEFAULT_EPISODE;
  return {
    title: `${getDisplayTitle(details.data)} · Episode ${episode}`,
    description: `Watch ${getDisplayTitle(details.data)} episode ${episode} (${
      language === "dub" ? "dub" : "sub"
    }) on OffAnime.`,
  };
}

export default async function AnimeWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ep?: string; language?: string }>;
}) {
  const { id } = await params;
  const anilistId = parseAnilistId(id);
  if (anilistId === null) notFound();

  const details = await getAnimeDetails(anilistId);
  if (!details.ok) {
    notFound();
  }

  const anime = details.data;
  const { ep = String(DEFAULT_EPISODE), language = DEFAULT_LANGUAGE } =
    await searchParams;
  const initialEpisode = Number.parseInt(ep, 10) || DEFAULT_EPISODE;
  const languageSelected = language === "dub" ? "dub" : "sub";

  // Fetch the episode metadata so the client can render and navigate using the
  // backend's globalEpisodeNumber (continuous across seasons) instead of a
  // season-local count. Failures here are non-fatal: the watch page degrades
  // to showing the anime without an episode grid.
  let episodes: AnimeEpisode[] = [];
  const episodesResult = await getAnimeEpisodes(anilistId);
  if (episodesResult.ok && Array.isArray(episodesResult.data.episodes)) {
    episodes = episodesResult.data.episodes;
  }

  return (
    <WatchPage
      anime={anime}
      episodes={episodes}
      initialEpisode={initialEpisode}
      initialLanguage={languageSelected}
    />
  );
}
