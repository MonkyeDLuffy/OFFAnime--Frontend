import Link from "next/link";
import { Info, Play, Star } from "lucide-react";
import type { HeroSlide } from "@/lib/types";
import SlideLogo, { TitleHeading } from "./SlideLogo";
import WatchLaterButton from "./WatchLaterButton";

/**
 * Lower-left hero composition: official TMDB logo (or title), title, native
 * title, clamped synopsis, metadata row, Play Now (navigates to the
 * /anime/[id] details page), Watch Later and Info. The logo dominates; the
 * description stays short (line-clamped) so the banner art keeps breathing.
 */
export default function HeroSlideContent({ slide }: { slide: HeroSlide }) {
  const hasLogo = Boolean(slide.logoUrl || slide.logoFallbackUrl);
  const nativeTitle =
    slide.nativeTitle && slide.nativeTitle !== slide.title ? slide.nativeTitle : null;

  return (
    <div className="max-w-2xl">
      {hasLogo && slide.logoUrl ? (
        <>
          <SlideLogo
            src={slide.logoUrl}
            fallbackSrc={slide.logoFallbackUrl}
            title={slide.title}
          />
          <h1 className="type-display mt-3 text-3xl text-white/90 sm:text-4xl lg:text-[42px]">
            {slide.title}
          </h1>
        </>
      ) : (
        <TitleHeading title={slide.title} />
      )}

      {nativeTitle ? (
        <p className="mt-1.5 text-sm text-white/55">{nativeTitle}</p>
      ) : null}

      {slide.description ? (
        <p className="mt-2.5 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/70 drop-shadow-[0_1px_12px_rgba(0,0,0,0.55)] sm:line-clamp-3 sm:text-[15px]">
          {slide.description}
        </p>
      ) : null}

      <MetadataRow slide={slide} />

      <div className="mt-5 flex items-center gap-3 sm:mt-6 sm:gap-3.5">
        <Link
          href={`/anime/${slide.anilistId}`}
          prefetch={true}
          className="glass-btn type-label inline-flex h-12 items-center gap-2.5 rounded-full px-8 text-sm text-white sm:h-[52px] sm:px-10 sm:text-[15px]"
        >
          <Play className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
          Play Now
        </Link>
        <WatchLaterButton slide={slide} />
        <Link
          href={`/anime/${slide.anilistId}`}
          prefetch={true}
          aria-label={`More information about ${slide.title}`}
          title="More information"
          className="glass-btn flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white sm:h-[52px] sm:w-[52px]"
        >
          <Info className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

function MetadataRow({ slide }: { slide: HeroSlide }) {
  const items: { key: string; label: string; node: React.ReactNode }[] = [];

  if (slide.rating !== null) {
    items.push({
      key: "rating",
      label: `Rated ${slide.rating.toFixed(1)} out of 10`,
      node: (
        <span className="inline-flex items-center gap-1.5">
          <Star
            className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          {slide.rating.toFixed(1)}
        </span>
      ),
    });
  }
  if (slide.year !== null) {
    items.push({ key: "year", label: `Released ${slide.year}`, node: <span>{slide.year}</span> });
  }
  if (slide.episodeCount !== null) {
    items.push({
      key: "episodes",
      label: `${slide.episodeCount} episodes`,
      node: (
        <span>
          {slide.episodeCount} {slide.episodeCount === 1 ? "Episode" : "Episodes"}
        </span>
      ),
    });
  }
  if (slide.genres.length > 0) {
    items.push({
      key: "genres",
      label: `Genres: ${slide.genres.join(", ")}`,
      node: <span>{slide.genres.join("  ·  ")}</span>,
    });
  }

  if (items.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80 sm:mt-5 sm:text-[15px]">
      {items.map((item, index) => (
        <li key={item.key} className="flex items-center gap-4">
          {index > 0 ? (
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-white/35" />
          ) : null}
          <span aria-label={item.label}>{item.node}</span>
        </li>
      ))}
    </ul>
  );
}
