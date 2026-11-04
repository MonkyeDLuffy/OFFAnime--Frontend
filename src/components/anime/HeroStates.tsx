import { TriangleAlert } from "lucide-react";
import type { HeroErrorKind } from "@/lib/types";
import RetryButton from "./RetryButton";

/**
 * Full-screen hero states (loading / error / empty). These are server
 * components — static, cinematic placeholders that never fabricate anime
 * content when the backend is unavailable.
 */

export function HeroLoadingState() {
  return (
    <section
      className="hero-viewport relative flex w-full items-center justify-center overflow-hidden bg-[#050507]"
      role="status"
      aria-label="Loading featured anime"
    >
      <div className="flex flex-col items-center gap-7">
        <p className="type-label animate-pulse text-xl text-white/85 sm:text-2xl">
          OFFANIME
        </p>
        <div className="h-px w-44 overflow-hidden bg-white/10">
          <div className="hero-loading-bar h-full w-1/3 bg-white/80" />
        </div>
      </div>
    </section>
  );
}

function describeError(kind: HeroErrorKind, status?: number): { title: string; description: string } {
  switch (kind) {
    case "not-configured":
      return {
        title: "Backend not configured",
        description:
          "Set OFFANIME_BACKEND_URL and BACKEND_API_SECRET in .env.local (server-side only), then restart the dev server to connect the OffAnime backend.",
      };
    case "unauthorized":
      return {
        title: "Backend rejected the credentials",
        description:
          "The configured BACKEND_API_SECRET was rejected by the backend (HTTP 401). Verify the secret matches the backend deployment.",
      };
    case "timeout":
      return {
        title: "The backend took too long to respond",
        description: "The request timed out. Try again in a moment.",
      };
    case "http":
      return {
        title: "The backend returned an error",
        description: `The OffAnime backend responded with HTTP ${status ?? "error"}. Check the backend logs for details.`,
      };
    default:
      return {
        title: "The backend is unreachable",
        description:
          "The OffAnime backend could not be reached from the server. Verify OFFANIME_BACKEND_URL and that the backend is running.",
      };
  }
}

export function HeroErrorState({ kind, status }: { kind: HeroErrorKind; status?: number }) {
  const { title, description } = describeError(kind, status);
  return (
    <section className="hero-viewport relative flex w-full items-center justify-center overflow-hidden bg-[#050507] px-6">
      <div className="max-w-md text-center">
        <TriangleAlert className="mx-auto h-8 w-8 text-white/45" aria-hidden="true" />
        <h1 className="type-display mt-5 text-[30px] sm:text-36px lg:text-42px">{title}</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-white/60">{description}</p>
        <RetryButton />
      </div>
    </section>
  );
}

export function HeroEmptyState() {
  return (
    <section className="hero-viewport relative flex w-full items-center justify-center overflow-hidden bg-[#050507] px-6">
      <div className="max-w-md text-center">
        <h1 className="type-display text-[30px] sm:text-36px lg:text-42px">Nothing trending right now</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-white/60">
          The backend did not return any valid trending anime. Check back soon.
        </p>
      </div>
    </section>
  );
}
