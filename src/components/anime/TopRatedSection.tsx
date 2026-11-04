import { buildTopRatedEntries } from "@/lib/anime";
import { getHomeFeed } from "@/lib/api";
import PopularRow from "./PopularRow";
import SectionReveal from "./SectionReveal";

/**
 * "TOP RATED ANIME" — the homepage row below "Trending Anime" and above
 * "Seasonal Anime".
 *
 * Reuses the exact `/api/home` feed the hero, Top 10, Popular and Trending
 * rows already load: within one render pass Next.js memoizes the identical
 * fetch (same URL and options), and the feed is Data-Cached for 60s (SHORT
 * TTL), so this adds no extra upstream call. The backend documents the home
 * sections independently (`trending`, `popular`, `seasonal`, `topRated`);
 * this row renders the `topRated` collection only — a distinct section, never
 * substituted with trending or popular data. The backend ships the entries
 * already ranked, so upstream order is preserved exactly as delivered. The
 * cards and the row are the shared PopularCard/PopularRow pair, so the
 * vertical posters, hover info panels, 700ms trailer popups (muted autoplay,
 * glass mute toggle) and carousel navigation are pixel-identical to the other
 * rows. The hero owns feed error/empty presentation, so this section renders
 * nothing when the feed failed or topRated is missing/empty — never padded
 * substitutes; entries with missing posters or trailers degrade gracefully
 * inside the card itself (gradient fallback, no preview).
 *
 * Spacing: the section carries no vertical padding of its own. The gap above
 * comes from TrendingRow's reserved hover-panel padding with its wrapper
 * pull-up; the gap below comes from the same mechanism on PopularRow — both
 * hover info panels and the pulled-up Seasonal section rely on this section
 * having no `overflow-hidden` to clip them. While a card is
 * hovered/keyboard-focused the section lifts itself above Seasonal
 * (hover:z-10 focus-within:z-20) so the overhanging panel overlays it,
 * Netflix-style (see PopularRow for the stacking-context rationale).
 */
export default async function TopRatedSection() {
  const feed = await getHomeFeed();
  if (!feed.ok) return null;

  const entries = buildTopRatedEntries(feed.data.topRated);
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="top-rated-heading"
      className="relative w-full bg-[#050507] hover:z-10 focus-within:z-20"
    >
      <SectionReveal
        heading={
          <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
            <h2
              id="top-rated-heading"
              className="type-display text-[27px] sm:text-34px lg:text-40px"
            >
              TOP RATED ANIME
            </h2>
          </div>
        }
      >
        <PopularRow
          entries={entries}
          listLabel="Top rated anime"
          navLabelPrefix="Top Rated"
        />
      </SectionReveal>
    </section>
  );
}
