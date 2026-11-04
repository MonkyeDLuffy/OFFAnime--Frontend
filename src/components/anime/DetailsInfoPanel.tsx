import {
  getDisplayDuration,
  getDisplayEpisodeCount,
  getDisplayFormat,
  getDisplayStatus,
  isMovieFormat,
} from "@/lib/anime";
import type { Anime } from "@/lib/types";

/**
 * Compact translucent liquid-glass information panel for the anime details
 * page: labels on the left, values on the right, rows separated by thin
 * borders. Every value comes straight from the normalized
 * `/api/details/:id` payload — unavailable fields are omitted, and the whole
 * panel is not rendered at all when the payload carries none of them
 * (nothing is ever hardcoded or fabricated).
 */
export default function DetailsInfoPanel({
  anime,
  title,
}: {
  anime: Anime;
  title: string;
}) {
  const rows: { key: string; label: string; value: string }[] = [];

  const status = getDisplayStatus(anime);
  if (status !== null) rows.push({ key: "status", label: "Status", value: status });

  const format = getDisplayFormat(anime);
  if (format !== null) rows.push({ key: "format", label: "Format", value: format });

  // A movie's meaningful facts are its status and runtime; AniList commonly
  // reports `episodes: 1` for films, so the episode row is movie-suppressed.
  const episodes = isMovieFormat(anime) ? null : getDisplayEpisodeCount(anime);
  if (episodes !== null) {
    rows.push({ key: "episodes", label: "Episodes", value: String(episodes) });
  }

  const duration = getDisplayDuration(anime);
  if (duration !== null) rows.push({ key: "duration", label: "Duration", value: duration });

  if (rows.length === 0) return null;

  return (
    <aside
      aria-label={`${title} information`}
      className="glass-panel w-full max-w-[340px] self-start overflow-hidden rounded-2xl sm:max-w-[320px] lg:max-w-[300px] lg:self-end"
    >
      <dl>
        {rows.map((row, index) => (
          <div
            key={row.key}
            className={`flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5 sm:py-3 ${
              index > 0 ? "border-t border-white/10" : ""
            }`}
          >
            <dt className="type-label text-xs uppercase text-white/50">
              {row.label}
            </dt>
            <dd className="text-right text-sm font-medium text-white/90">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
