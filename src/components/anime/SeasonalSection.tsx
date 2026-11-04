import { buildSeasonalEntries } from "@/lib/anime";
import { getHomeFeed } from "@/lib/api";
import PopularRow from "./PopularRow";
import SectionReveal from "./SectionReveal";

/**
 * "Seasonal Anime" — the homepage's final carousel, below "TOP RATED ANIME".
 *
 * Reuses the exact `/api/home` feed the hero and every other row already
 * load: within one render pass Next.js memoizes the identical fetch (same
 * URL and options), and the feed is Data-Cached for 60s (SHORT TTL), so this
 * adds no extra upstream call. The backend documents the home sections
 * independently (`trending`, `popular`, `seasonal`, `topRated`); this row
 * renders the `seasonal` collection only — a distinct section, never
 * substituted with trending, popular or topRated data. Upstream order is
 * preserved exactly as delivered. The cards and the row are the shared
 * PopularCard/PopularRow pair, so the vertical posters, hover info panels,
 * 700ms trailer popups (muted autoplay, glass mute toggle) and carousel
 * navigation are pixel-identical to the other rows. Because this is the last
 * section, its bottom padding (pb-20 sm:pb-24) offsets the shared
 * PopularRow wrapper's pull-up (-mb-8 sm:-mb-12, see PopularRow) so the page
 * ends a comfortable distance below the posters, and the reserved
 * hover-panel space stays fully inside this (overflow-hidden) section, so a
 * panel on the last row is never clipped. The hero owns feed error/empty
 * presentation, so this section renders nothing when the feed failed or
 * seasonal is missing/empty — never padded substitutes; entries with
 * missing posters or trailers degrade gracefully inside the card itself
 * (gradient fallback, no preview).
 */
export default async function SeasonalSection() {
  const feed = await getHomeFeed();
  if (!feed.ok) return null;

  const entries = buildSeasonalEntries(feed.data.seasonal);
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="seasonal-heading"
      className="relative w-full overflow-hidden bg-[#050507] pb-20 sm:pb-24"
    >
      <SectionReveal
        heading={
          <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
            <h2
              id="seasonal-heading"
              className="type-display text-[27px] sm:text-34px lg:text-40px"
            >
              Seasonal Anime
            </h2>
          </div>
        }
      >
        <PopularRow
          entries={entries}
          listLabel="Seasonal anime"
          navLabelPrefix="Seasonal"
        />
      </SectionReveal>
    </section>
  );
}
