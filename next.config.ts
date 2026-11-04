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
  },
};

export default nextConfig;
