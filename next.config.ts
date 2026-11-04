import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Only documented image hosts are allowed through the optimizer.
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org", pathname: "/t/p/**" },
      { protocol: "https", hostname: "s4.anilist.co", pathname: "/file/anilistcdn/**" },
      { protocol: "https", hostname: "artworks.thetvdb.com", pathname: "/banners/**" },
    ],
    // OpenNext falls back to a single allowed quality ([75]) when
    // images.qualities is absent from the manifest, which rejects every
    // quality the carousel/hero components actually request (30, 85, 90)
    // with HTTP 400. Declare the full set used by the app so OpenNext reads
    // it from the manifest instead of its narrow default.
    qualities: [30, 75, 85, 90, 95],
    // Custom loader: AniList (s4.anilist.co) is served as a raw URL so the
    // browser fetches it directly. AniList's CDN returns HTTP 403 for every
    // request from Cloudflare Workers egress, so routing AniList through the
    // /_next/image optimizer (which fetches from Worker egress) breaks all
    // AniList posters/backdrops. TMDB, TVDB and local assets keep using the
    // default optimizer unchanged. TMDB remains the primary artwork source;
    // AniList is only a fallback when TMDB artwork is unavailable.
    loaderFile: "./src/lib/anilist-image-loader.ts",
  },
};

export default nextConfig;
