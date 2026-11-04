#!/usr/bin/env node
/**
 * OFFANIME dynamic XML sitemap generator.
 *
 * Builds the public sitemap files served from `public/`:
 *   public/sitemap.xml          — sitemap index
 *   public/sitemaps/pages.xml   — static public pages
 *   public/sitemaps/anime-N.xml — anime detail URL batches (≤ 5,000 URLs each)
 *   public/robots.txt           — crawling policy + sitemap reference
 *
 * The backend exposes NO single "complete catalogue" endpoint, so the
 * generator traverses every `/api/category/:type` listing (special categories
 * + AniList genres), paginating until each listing reports no more records,
 * and deduplicates by AniList ID. Rate-limit responses (429) are retried with
 * backoff; a single failing category never aborts the whole build.
 *
 * Run:
 *   node scripts/generate-sitemaps.js
 *
 * Reads OFFANIME_BACKEND_URL and BACKEND_API_SECRET from the environment.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "public");
const SITEMAPS_DIR = join(PUBLIC, "sitemaps");

const BACKEND_URL = process.env.OFFANIME_BACKEND_URL;
const BACKEND_SECRET = process.env.BACKEND_API_SECRET;
const SITE_URL = (process.env.SITE_URL || "https://offanime.cc").replace(/\/+$/, "");

if (!BACKEND_URL || !BACKEND_SECRET) {
  console.error("ERROR: OFFANIME_BACKEND_URL and BACKEND_API_SECRET must be set.");
  process.exit(1);
}

const PER_PAGE = 50;
const MAX_PAGES_PER_LISTING = 500;
const BATCH_SIZE = 5_000;
const REQUEST_TIMEOUT_MS = 25_000;
const RETRY_BASE_MS = 1_000;
const MAX_ATTEMPTS = 4;

const CATEGORIES = [
  "trending", "popular", "top", "top rated", "airing", "upcoming",
  "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy",
  "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery",
  "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports",
  "Supernatural", "Thriller",
];

const FETCH_CONCURRENCY = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(path, { attempts = MAX_ATTEMPTS } = {}) {
  const url = `${BACKEND_URL.replace(/\/+$/, "")}/api/${path.replace(/^\/+/, "")}`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          headers: { accept: "application/json", "x-api-key": BACKEND_SECRET },
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 429 && attempt < attempts) {
          await sleep(RETRY_BASE_MS * attempt);
          continue;
        }
        if (!response.ok) return null;
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (attempt < attempts) await sleep(RETRY_BASE_MS * attempt);
    }
  }
  return null;
}

function asString(v) { return typeof v === "string" ? v : null; }
function asNumber(v) { return typeof v === "number" && Number.isFinite(v) ? v : null; }
function asUrl(v) {
  if (typeof v !== "string") return null;
  try { const u = new URL(v); return (u.protocol === "http:" || u.protocol === "https:") ? v : null; } catch { return null; }
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const e = raw;
  const anilistId =
    (typeof e.anilistId === "number" && Number.isFinite(e.anilistId) ? e.anilistId :
     typeof e.id === "number" && Number.isFinite(e.id) ? e.id : null);
  if (!anilistId || anilistId <= 0) return null;
  const images = e.images && typeof e.images === "object" ? e.images : null;
  return {
    id: typeof e.id === "number" ? e.id : anilistId,
    anilistId,
    malId: typeof e.malId === "number" ? e.malId : null,
    title: asString(e.title),
    titleEnglish: asString(e.titleEnglish),
    titleRomaji: asString(e.titleRomaji),
    titleNative: asString(e.titleNative),
    format: asString(e.format),
    status: asString(e.status),
    episodes: asNumber(e.episodes),
    season: asString(e.season),
    seasonYear: asNumber(e.seasonYear),
    averageScore: asNumber(e.averageScore),
    genres: Array.isArray(e.genres) ? e.genres.filter((g) => typeof g === "string") : [],
    images: images
      ? { poster: asUrl(images.poster), cover: asUrl(images.cover), banner: asUrl(images.banner) }
      : null,
  };
}

async function fetchCategoryPages(category) {
  const entries = [];
  let page = 1;
  let consecutiveEmpty = 0;
  while (page <= MAX_PAGES_PER_LISTING) {
    const payload = await fetchJson(
      `category/${encodeURIComponent(category)}?page=${page}&perPage=${PER_PAGE}`,
    );
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (results.length === 0) {
      consecutiveEmpty += 1;
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
      for (const raw of results) {
        const entry = normalizeEntry(raw);
        if (entry) entries.push(entry);
      }
    }
    const pageInfo = payload?.pageInfo ?? {};
    if (pageInfo.hasNextPage === false) break;
    page += 1;
  }
  return entries;
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}
function urlEntry(loc) {
  return `<url><loc>${xmlEscape(loc)}</loc><lastmod>${new Date().toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
}
function urlset(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
function sitemapEntry(loc) {
  return `<sitemap><loc>${xmlEscape(loc)}</loc></sitemap>`;
}
function sitemapIndex(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</sitemapindex>\n`;
}

async function main() {
  mkdirSync(SITEMAPS_DIR, { recursive: true });

  console.log("Fetching full anime catalogue from backend...");
  const byId = new Map();
  for (let i = 0; i < CATEGORIES.length; i += FETCH_CONCURRENCY) {
    const batch = CATEGORIES.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((cat) => fetchCategoryPages(cat)));
    let batchCount = 0;
    for (const entries of results) {
      for (const anime of entries) {
        if (!byId.has(anime.anilistId)) {
          byId.set(anime.anilistId, anime);
          batchCount += 1;
        }
      }
    }
    console.log(`  ${batch.join(", ")} -> +${batchCount} new (total ${byId.size})`);
    await sleep(400); // politeness pause between category batches
  }

  const catalogue = Array.from(byId.values()).sort((a, b) => a.anilistId - b.anilistId);
  console.log(`\nTotal unique eligible anime: ${catalogue.length}`);

  // Static pages sitemap.
  const staticPages = [
    { path: "/" },
    { path: "/anime" },
    { path: "/contact" },
    { path: "/dmca" },
    { path: "/terms" },
  ];
  const staticXml = urlset(staticPages.map((p) => urlEntry(`${SITE_URL}${p.path}`)));
  writeFileSync(join(SITEMAPS_DIR, "pages.xml"), staticXml, "utf-8");

  // Anime batches.
  const allAnimeUrls = catalogue.map((a) => `${SITE_URL}/anime/${a.anilistId}`);
  const batches = [];
  for (let i = 0; i < allAnimeUrls.length; i += BATCH_SIZE) {
    batches.push(allAnimeUrls.slice(i, i + BATCH_SIZE));
  }
  for (let i = 0; i < batches.length; i++) {
    writeFileSync(join(SITEMAPS_DIR, `anime-${i}.xml`), urlset(batches[i].map(urlEntry)), "utf-8");
  }

  // Sitemap index.
  const indexEntries = [sitemapEntry(`${SITE_URL}/sitemaps/pages.xml`)];
  for (let i = 0; i < batches.length; i++) {
    indexEntries.push(sitemapEntry(`${SITE_URL}/sitemaps/anime-${i}.xml`));
  }
  writeFileSync(join(PUBLIC, "sitemap.xml"), sitemapIndex(indexEntries), "utf-8");

  // robots.txt.
  const robots = [
    "# OffAnime robots.txt",
    "# Public crawling policy",
    "",
    "User-agent: *",
    "Allow: /",
    "Allow: /_next/static/",
    "Allow: /fonts/",
    "Allow: /anime/",
    "",
    "# Private / non-indexable areas",
    "Disallow: /account/",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /forgot-password",
    "Disallow: /reset-password",
    "Disallow: /watchlist",
    "Disallow: /anime/*/watch",
    "Disallow: /api/",
    "Disallow: /search/*",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    "",
  ].join("\n");
  writeFileSync(join(PUBLIC, "robots.txt"), robots, "utf-8");

  console.log(`\nGenerated ${batches.length} anime sitemap batch(es) + pages.xml + sitemap.xml + robots.txt`);
  console.log(`Sitemap index: ${SITE_URL}/sitemap.xml`);
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
