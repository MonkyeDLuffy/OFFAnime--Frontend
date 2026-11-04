import { TriangleAlert } from "lucide-react";
import { buildTrendingEntries } from "@/lib/anime";
import { getHomeFeed } from "@/lib/api";
import RetryButton from "./RetryButton";
import SectionReveal from "./SectionReveal";
import TrendingRow from "./TrendingRow";

/**
 * "Trending Anime" — the homepage row directly below "Popular Anime".
 *
 * Reuses the exact `/api/home` feed the hero, Top 10 and Popular rows already
 * load: within one render pass Next.js memoizes the identical fetch (same URL
 * and options), and the feed is Data-Cached for 60s (SHORT TTL), so this adds
 * no extra upstream call. This row renders the `trending` collection (the
 * same section the hero and Top 10 read) through the shared poster-entry
 * builder, so the cards are visually identical to the Popular row.
 *
 * Unlike the hero-fed sections above (whose error/empty presentation the hero
 * owns), this row is self-contained: it shows its own compact loading
 * skeleton, error and empty states so a feed problem below the fold is still
 * explained — never padded with fabricated content.
 *
 * Spacing: the section carries no vertical padding of its own (the skeleton
 * mirrors it automatically through the shared SECTION_CLASS). The gap above
 * comes from PopularRow's reserved hover-panel padding with its wrapper
 * pull-up (see PopularRow); the gap below comes from the same mechanism on
 * TrendingRow. No `overflow-hidden` here — the hover panels overhang this
 * section's box and overlay the next one.
 */

const SECTION_CLASS =
  "relative w-full bg-[#050507] hover:z-10 focus-within:z-20";

function SectionHeading() {
  return (
    <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
      <h2
        id="trending-heading"
        className="type-display text-[27px] sm:text-34px lg:text-40px"
      >
        Trending Anime
      </h2>
    </div>
  );
}

export default async function TrendingSection() {
  const feed = await getHomeFeed();

  if (!feed.ok) {
    return (
      <section
        aria-labelledby="trending-heading"
        className={SECTION_CLASS}
      >
        <SectionHeading />
        <div className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
          <TriangleAlert className="h-7 w-7 text-white/40" aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-white">
            Trending Anime is unavailable right now
          </p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
            The backend feed could not be loaded. Check your connection and
            try again.
          </p>
          <RetryButton />
        </div>
      </section>
    );
  }

  const entries = buildTrendingEntries(feed.data.trending);
  if (entries.length === 0) {
    return (
      <section
        aria-labelledby="trending-heading"
        className={SECTION_CLASS}
      >
        <SectionHeading />
        <div className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
          <p className="text-sm font-semibold text-white">
            Nothing trending right now
          </p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/60">
            The backend did not return any valid trending anime. Check back
            soon.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="trending-heading" className={SECTION_CLASS}>
      <SectionReveal heading={<SectionHeading />}>
        <TrendingRow entries={entries} />
      </SectionReveal>
    </section>
  );
}

/** Mirror of the real section layout (same heights) so streaming in the
    content causes no visible layout shift. */
export function TrendingSectionSkeleton() {
  return (
    <section
      aria-label="Trending Anime"
      aria-busy="true"
      className={SECTION_CLASS}
    >
      <div className="px-6 sm:px-10 lg:px-16 xl:px-24">
        <div className="h-8 w-44 rounded-lg bg-white/10 motion-safe:animate-pulse sm:h-9 lg:h-10" />
      </div>
      <div
        aria-hidden="true"
        className="mt-4 flex gap-4 overflow-hidden px-6 pb-28 pt-4 sm:mt-5 sm:gap-5 sm:px-10 sm:pb-32 lg:gap-6 lg:px-16 xl:px-24"
      >
        {[0, 1, 2, 3, 4, 5, 6].map((card) => (
          <div
            key={card}
            className="aspect-[2/3] w-[58vw] max-w-[240px] shrink-0 rounded-xl bg-white/[0.06] motion-safe:animate-pulse sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]"
          />
        ))}
      </div>
    </section>
  );
}
