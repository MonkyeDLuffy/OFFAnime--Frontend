import { Suspense } from "react";
import type { Metadata } from "next";
import { homepageMetadata } from "@/lib/seo";
import AnimeHero from "@/components/anime/AnimeHero";
import PopularSection from "@/components/anime/PopularSection";
import SeasonalSection from "@/components/anime/SeasonalSection";
import TopRatedSection from "@/components/anime/TopRatedSection";
import TopTenSection from "@/components/anime/TopTenSection";
import TrailerAmbientBackground from "@/components/anime/TrailerAmbientBackground";
import TrendingSection, {
  TrendingSectionSkeleton,
} from "@/components/anime/TrendingSection";
import { HeroLoadingState } from "@/components/anime/HeroStates";
import ContinueWatchingSection from "@/components/continue-watching/ContinueWatchingSection";

/**
 * Anime homepage. The hero slider data is fetched server-side (backend
 * credentials never reach the browser) and streams behind a loading state.
 * Feeds are revalidated every 60s, matching the backend's SHORT cache TTL.
 * Streams in behind a loading state. Feeds are revalidated every 60s,
 * matching the backend's SHORT cache TTL. The Top 10, Popular Anime,
 * Trending Anime, TOP RATED ANIME and Seasonal Anime sections reuse the same
 * memoized `/api/home` feed — no extra upstream call — and stream in behind
 * their own boundaries.
 */

export const revalidate = 60;

export const metadata: Metadata = homepageMetadata();

export default function AnimeHomePage() {
  return (
    <main>
      {/* Full-viewport cinematic backdrop mirroring the hover trailers of
          the Trending / Popular / Top Rated carousels (portaled to <body>,
          painted below all content). It stays idle until a card's preview
          claims the shared active-trailer slot. */}
      <TrailerAmbientBackground />
      <Suspense fallback={<HeroLoadingState />}>
        <AnimeHero />
      </Suspense>
      <Suspense fallback={null}>
        <TopTenSection />
      </Suspense>
      <Suspense fallback={null}>
        <ContinueWatchingSection />
      </Suspense>
      <Suspense fallback={null}>
        <PopularSection />
      </Suspense>
      <Suspense fallback={<TrendingSectionSkeleton />}>
        <TrendingSection />
      </Suspense>
      <Suspense fallback={null}>
        <TopRatedSection />
      </Suspense>
      <Suspense fallback={null}>
        <SeasonalSection />
      </Suspense>
    </main>
  );
}
