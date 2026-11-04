"use client";

/**
 * Client-safe metadata hydration for continue-watching cards.
 *
 * `src/lib/api.ts` is `server-only` and cannot be imported from client
 * components. This module mirrors its `/details/:id` and `/episodes/:id`
 * calls through the same-origin Next.js proxy (which forwards HttpOnly
 * session cookies and injects the server API key). It is safe to import from
 * client components.
 *
 * Nothing here is persisted; it only hydrates display metadata for cards
 * whose identity (anilistId + episode) comes from the backend's
 * continue-watching list.
 */

import type { Anime } from "@/lib/types";

const METADATA_TIMEOUT_MS = 12_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`/api/${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Hydrate one anime's details + its episodes list. Returns null on failure. */
export async function hydrateAnimeMetadata(anilistId: number): Promise<{
  anime: Anime | null;
  episodes: { globalEpisodeNumber: number; title: string | null; image: string | null }[];
} | null> {
  const [details, episodes] = await Promise.all([
    fetchJson(`details/${anilistId}`),
    fetchJson(`episodes/${anilistId}`),
  ]);

  const anime = isRecord(details) ? (details as unknown as Anime) : null;

  // `episodes.episodes` is a JSON ARRAY (verify live: top-level `{ episodes:
  // [...] }` from anizip). `isRecord` rejects arrays, so the episode list must
  // be checked with Array.isArray BEFORE record-shape narrowing.
  const rawEpisodes =
    isRecord(episodes) && Array.isArray(episodes.episodes)
      ? (episodes.episodes as unknown[])
      : [];

  const mapped: { globalEpisodeNumber: number; title: string | null; image: string | null }[] = [];
  for (const ep of rawEpisodes as unknown[]) {
    if (!isRecord(ep)) continue;
    const e = ep as Record<string, unknown>;
    const globalEpisodeNumber =
      typeof e.globalEpisodeNumber === "number"
        ? (e.globalEpisodeNumber as number)
        : 0;
    if (globalEpisodeNumber <= 0) continue;
    mapped.push({
      globalEpisodeNumber,
      title: typeof e.title === "string" ? (e.title as string) : null,
      image: typeof e.image === "string" ? (e.image as string) : null,
    });
  }

  const result: {
    anime: Anime | null;
    episodes: { globalEpisodeNumber: number; title: string | null; image: string | null }[];
  } = { anime, episodes: mapped };
  return result;
}
