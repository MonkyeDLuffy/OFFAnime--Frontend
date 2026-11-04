"use client";

import AnimeDetailsSkeleton from "@/components/anime/AnimeDetailsSkeleton";

/**
 * Route-level loading UI for `/anime/[id]`.
 *
 * Next.js renders this automatically during client-side transitions to the
 * details page, so the moment a user clicks an anime card they see a premium
 * skeleton instead of an empty black screen. The shell streams in from the
 * server behind it and replaces the skeleton once the details data is ready.
 * No artificial delay — the skeleton shows immediately and is replaced as
 * soon as the data loads.
 */

export default function AnimeDetailsLoading() {
  return <AnimeDetailsSkeleton />;
}
