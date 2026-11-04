/**
 * Custom Next.js image loader for the Cloudflare Workers + OpenNext build.
 *
 * Problem (verified with live production + real Worker egress probes):
 *   AniList's CDN (s4.anilist.co) returns HTTP 403
 *   `{"errors":[{"message":"You have been manually blocked..."}]}` for every
 *   request originating from Cloudflare Workers egress — regardless of request
 *   headers (bare fetch and browser-User-Agent fetch both fail). The `/_next/image`
 *   optimizer fetches upstream from Worker egress, so any AniList poster routed
 *   through it fails with 403. TMDB image.tmdb.org returns 200 from the same
 *   egress (control confirmed), so TMDB must keep using the optimizer.
 *
 * Fix:
 *   For AniList hosts only, return the raw source URL so the browser fetches
 *   the image directly — no `/_next/image` subrequest, no Worker egress to
 *   AniList. TMDB, TVDB and local assets keep going through Next's default
 *   optimizer byte-for-byte (same `?_next/image?url=...&w=...&q=...` shape).
 *
 * Delivery policy only — this loader never changes which URLs are selected:
 *   TMDB remains the primary artwork source; AniList is only ever a fallback
 *   when TMDB artwork is unavailable (callers build candidate lists in
 *   src/lib/anime.ts and components render onError fallback chains).
 *
 * Preserved for every <Image>: fill/object-fit cover, object-position,
 * lazy loading (Next handles `loading`), draggable, key, alt, onLoad/onError,
 * sizes, className, hover transforms — only the generated `src` changes for
 * AniList hosts.
 */
/** Shape of the props Next.js passes to an image loader (Next 15). */
type ImageLoaderProps = {
  config: {
    deviceSizes: number[];
    imageSizes: number[];
    qualities: number[] | undefined;
    path: string;
    loader: string;
  };
  src: string;
  width: number;
  quality: number | undefined;
};

/** Hosts whose images must NOT be routed through the /_next/image optimizer. */
const BYPASS_HOSTS = new Set(["s4.anilist.co"]);

/**
 * Mirrors Next's default loader output shape for remote images exactly:
 * `/_next/image?url=<encoded>&w=<width>&q=<quality>` (no `dpl` for remote).
 * Defensively tolerates a missing `config` (some prerender call sites don't
 * pass it) by falling back to sensible defaults.
 */
function defaultLoaderShape({
  config,
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  const path = config?.path ?? "/_next/image";
  const q =
    quality ??
    (config?.qualities?.reduce(
      (prev, cur) =>
        Math.abs(cur - 75) < Math.abs(prev - 75) ? cur : prev,
      config?.qualities?.[0] ?? 75,
    ) ?? 75);
  return `${path}?url=${encodeURIComponent(src)}&w=${width}&q=${q}`;
}

export default function anilistAwareImageLoader({
  config,
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  try {
    const host = new URL(src).hostname;
    if (BYPASS_HOSTS.has(host)) {
      // Raw URL: the browser fetches AniList directly, bypassing Cloudflare
      // Worker egress that AniList blocks with HTTP 403.
      return src;
    }
  } catch {
    // Not an absolute URL (local asset) — fall through to default handling.
  }
  return defaultLoaderShape({ config, src, width, quality });
}
