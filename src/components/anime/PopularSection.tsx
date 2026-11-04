import { buildPopularEntries } from "@/lib/anime";
import { getHomeFeed } from "@/lib/api";
import PopularRow from "./PopularRow";
import SectionReveal from "./SectionReveal";

/**
 * "Popular Anime" — the homepage row directly under "TOP 10 | CONTENT TODAY".
 *
 * Reuses the exact `/api/home` feed the hero and Top 10 already load: within
 * one render pass Next.js memoizes the identical fetch (same URL and
 * options), and the feed is Data-Cached for 60s (SHORT TTL), so this adds no
 * extra upstream call. The backend documents the home sections independently
 * (`trending`, `popular`, `seasonal`, `topRated`); this row renders the
 * `popular` collection only — never the trending list. The hero owns feed
 * error/empty presentation, so this section renders nothing when the feed
 * failed or popular is missing/empty — never padded substitutes.
 *
 * Spacing: the section carries no vertical padding of its own. The gap above
 * comes from TopTenSection's compact bottom padding; the gap below comes from
 * PopularRow's reserved hover-panel padding with its wrapper pull-up (see
 * PopularRow) — both hover info panels and the pulled-up next section rely
 * on this section having no `overflow-hidden` to clip them.
 */
export default async function PopularSection() {
  const feed = await getHomeFeed();
  if (!feed.ok) return null;

  const entries = buildPopularEntries(feed.data.popular);
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby="popular-heading"
      className="relative w-full bg-[#050507] hover:z-10 focus-within:z-20"
    >
      <SectionReveal
        heading={
          <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
            <h2
              id="popular-heading"
              className="type-display text-[27px] sm:text-34px lg:text-40px"
            >
              Popular Anime
            </h2>
          </div>
        }
      >
        <PopularRow entries={entries} />
      </SectionReveal>
    </section>
  );
}
