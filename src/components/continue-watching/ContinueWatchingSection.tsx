"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CAROUSEL_EDGE_FADE_LEFT_CLASS,
  CAROUSEL_EDGE_FADE_RIGHT_CLASS,
  CAROUSEL_NAV_BUTTON_CLASS,
} from "@/components/anime/carousel-ui";
import SectionReveal from "@/components/anime/SectionReveal";
import { useCarouselScroll } from "@/components/anime/use-carousel-scroll";
import { useContinueWatching } from "@/hooks/use-continue-watching";
import ContinueWatchingCard from "./ContinueWatchingCard";

/** Skeleton cards rendered while the continue-watching list is in flight. */
const SKELETON_COUNT = 4;

export default function ContinueWatchingSection() {
  const { status: cwStatus, items, removeEntry } = useContinueWatching();
  const { scrollerRef, canScrollLeft, canScrollRight, scrollByPage } =
    useCarouselScroll(Math.max(items.length, SKELETON_COUNT));
  const showing = cwStatus === "loading" ? Array(SKELETON_COUNT).fill(null) : items;

  // Guests, unauthenticated users, and users with no history see nothing.
  if (cwStatus === "idle" || showing.length === 0) return null;
  // Hard errors don't break the homepage — the section simply stays hidden.
  if (cwStatus === "error" || cwStatus === "unavailable") return null;

  return (
    <section
      aria-labelledby="continue-watching-heading"
      className="relative w-full bg-[#050507] hover:z-10 focus-within:z-20"
    >
      <SectionReveal
        heading={
          <div className="relative px-6 sm:px-10 lg:px-16 xl:px-24">
            <h2
              id="continue-watching-heading"
              className="type-display text-[27px] sm:text-34px lg:text-40px"
            >
              CONTINUE WATCHING
            </h2>
          </div>
        }
      >
        <div className="relative mt-4 sm:mt-5">
          <ul
            ref={scrollerRef}
            role="list"
            aria-label="Continue watching"
            className="no-scrollbar flex gap-4 overflow-x-auto overflow-y-clip overscroll-x-contain px-6 pb-6 pt-4 sm:gap-5 sm:px-10 lg:gap-6 lg:px-16 xl:px-24"
          >
            {showing.map((entry, index) => (
              <li key={entry?.anilistId ?? index}>
                {entry ? (
                  <ContinueWatchingCard
                    entry={entry}
                    onRemove={removeEntry}
                  />
                ) : (
                  <div className="flex w-[58vw] max-w-[240px] shrink-0 flex-col gap-2 sm:w-[240px] md:w-[260px] lg:w-[280px] xl:w-[290px] 2xl:w-[300px]">
                    <div
                      className="h-[135px] rounded-[16px] bg-white/[0.06] animate-pulse"
                    />
                    <div className="mt-2 h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
                    <div className="mt-1 h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {canScrollLeft ? (
            <div aria-hidden="true" className={CAROUSEL_EDGE_FADE_LEFT_CLASS} />
          ) : null}
          {canScrollRight ? (
            <div aria-hidden="true" className={CAROUSEL_EDGE_FADE_RIGHT_CLASS} />
          ) : null}

          {canScrollLeft ? (
            <button
              type="button"
              onClick={() => scrollByPage(-1)}
              aria-label="Scroll continue watching backward"
              className={`${CAROUSEL_NAV_BUTTON_CLASS} left-3 sm:left-5`}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
          {canScrollRight ? (
            <button
              type="button"
              onClick={() => scrollByPage(1)}
              aria-label="Scroll continue watching forward"
              className={`${CAROUSEL_NAV_BUTTON_CLASS} right-3 sm:right-5`}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </SectionReveal>
    </section>
  );
}
