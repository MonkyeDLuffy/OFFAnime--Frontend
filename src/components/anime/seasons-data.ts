/**
 * Seasons data layer (`GET /api/seasons/:anilistId` — verified shape in
 * `src/lib/types.ts`): pure classification + the session-level fetch cache,
 * so the carousel component stays presentation-only.
 *
 * Conventions mirror `RecommendedCarousel` exactly: same-origin relative
 * fetch through the Next.js proxy (API key stays server-side), `no-store`,
 * hard timeout, one promise per AniList ID (dedupe of concurrent in-flight
 * requests), failure surfaces as a resolved null AND evicts the cache entry
 * so a later mount or Retry performs a real request.
 */
import type { SeasonEntry } from "@/lib/types";

/** Session-level cache: one in-flight/resolved request per AniList ID. */
const seasonsCache = new Map<number, Promise<SeasonsPayload | null>>();

const REQUEST_TIMEOUT_MS = 12_000;

/** Everything a SEASONS card needs, pre-classified by the carousel. */
export interface SeasonCardModel {
  anilistId: number;
  /** titleEnglish ?? title ?? titleRomaji ?? titleNative ?? "Untitled". */
  title: string;
  posterUrl: string | null;
  coverUrl: string | null;
  bannerUrl: string | null;
  format: string | null;
  year: number | null;
  episodeCount: number | null;
  /** Reliable "Season N", parsed from the returned titles only; null when none. */
  seasonNumber: number | null;
  /** Backend relationship label for numberless entries ("Prequel"/"Sequel"). */
  relationLabel: string | null;
  isCurrent: boolean;
}

/** Minimal contract the SEASONS section consumes after sanitizing. */
export interface SeasonsPayload {
  anime: SeasonEntry;
  prequels: SeasonEntry[];
  sequels: SeasonEntry[];
}

export function fetchSeasons(
  anilistId: number,
): Promise<SeasonsPayload | null> {
  const cached = seasonsCache.get(anilistId);
  if (cached) return cached;

  const request = (async () => {
    try {
      // Relative same-origin path → the Next.js proxy injects the backend
      // API key; the browser never sees or needs it.
      const response = await fetch(`/api/seasons/${anilistId}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        // Evict so a Retry (or a later navigation) starts a REAL fetch
        // instead of re-serving this null forever.
        seasonsCache.delete(anilistId);
        return null;
      }
      const payload: unknown = await response.json();
      const sanitized = sanitizeSeasons(payload);
      if (sanitized === null) {
        seasonsCache.delete(anilistId);
        return null;
      }
      return sanitized;
    } catch {
      // Transport failure, timeout or non-JSON body → section-level failure
      // state, never an empty-looking success. Evict so retry refetches.
      seasonsCache.delete(anilistId);
      return null;
    }
  })();

  seasonsCache.set(anilistId, request);
  request.catch(() => {
    // Belt-and-braces: the promise cannot reject, but a poisoned entry must
    // never stick for the session.
    if (seasonsCache.get(anilistId) === request) {
      seasonsCache.delete(anilistId);
    }
  });
  return request;
}

/* ---------------------------------------------------------------- sanitize */

/** Validity + nullability-preserving conversion of one raw entry. */
function sanitizeEntry(raw: unknown): SeasonEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const anilistId =
    typeof entry.anilistId === "number" && Number.isFinite(entry.anilistId)
      ? entry.anilistId
      : typeof entry.id === "number" && Number.isFinite(entry.id)
        ? entry.id
        : null;
  if (anilistId === null || anilistId <= 0) return null;
  const images =
    entry.images && typeof entry.images === "object"
      ? (entry.images as Record<string, unknown>)
      : null;
  return {
    id: typeof entry.id === "number" ? entry.id : anilistId,
    anilistId,
    malId: typeof entry.malId === "number" ? entry.malId : null,
    title: str(entry.title),
    titleEnglish: str(entry.titleEnglish),
    titleRomaji: str(entry.titleRomaji),
    titleNative: str(entry.titleNative),
    type: str(entry.type),
    format: str(entry.format),
    status: str(entry.status),
    episodes: num(entry.episodes),
    season: str(entry.season),
    seasonYear: num(entry.seasonYear),
    averageScore: num(entry.averageScore),
    genres: Array.isArray(entry.genres)
      ? entry.genres.filter((g): g is string => typeof g === "string")
      : null,
    images: images
      ? {
          poster: str(images.poster),
          cover: str(images.cover),
          banner: str(images.banner),
        }
      : null,
    relationType: str(entry.relationType),
    relationLabel: str(entry.relationLabel),
  };
}

function list(value: unknown): SeasonEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeEntry).filter((e): e is SeasonEntry => e !== null);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Shape-check the payload; anything unexpected (error JSON, null anime)
 * resolves to null → failure state. Returns only what the section consumes. */
export function sanitizeSeasons(raw: unknown): SeasonsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const anime = sanitizeEntry(source.anime);
  // The self entry is indispensable: without it there is no "current" anchor
  // to build the chronological chain from.
  if (!anime) return null;
  return {
    anime,
    prequels: list(source.prequels),
    sequels: list(source.sequels),
  };
}

/* --------------------------------------------- classification + ordering */

/** Only TV continuations of the main storyline count as seasons — observed
 * live data puts movies inside `sequels` (Evangelion) and OVAs inside
 * `prequels` (Attack on Titan), so format alone decides, never the group. */
const SEASON_FORMAT = "TV";

/** AniList season enum in watch-order within one calendar year. */
const SEASON_ORDER: Record<string, number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3,
};

/**Grouping semantics map used when `relationLabel` is itself missing. */const RELATION_FALLBACK_LABEL: Record<string, string> = {
  PREQUEL: "Prequel",
  SEQUEL: "Sequel",
};

/**
 * Converts the sanitized payload into the ordered, deduped card models in
 * watch order: chronologically sorted TV prequels → the current anime →
 * chronologically sorted TV sequels. Returns the full chain even when short
 * (the carousel decides visibility).
 */
export function buildSeasonCards(
  payload: SeasonsPayload,
  currentSeasonYear: number | null,
): SeasonCardModel[] {
  const currentId = payload.anime.anilistId;
  const seen = new Set<number>([currentId]);
  const unique = (entries: SeasonEntry[]): SeasonEntry[] =>
    entries.filter((entry) => {
      if (seen.has(entry.anilistId)) return false;
      seen.add(entry.anilistId);
      return true;
    });

  const isSeasonEntry = (entry: SeasonEntry): boolean =>
    entry.format === SEASON_FORMAT;

  const prequels = unique(payload.prequels.filter(isSeasonEntry)).sort(
    chronological,
  );
  const sequels = unique(payload.sequels.filter(isSeasonEntry)).sort(
    chronological,
  );

  return [
    ...prequels.map((entry) => toCard(entry, "Prequel", false)),
    toCard(payload.anime, "Current Season", true, currentSeasonYear),
    ...sequels.map((entry) => toCard(entry, "Sequel", false)),
  ];
}

/** Watch order inside prequels/sequels: year → season enum → parsed number
 * as a last-resort tiebreaker for same-year/same-season pairs. Stable on
 * ties (backend order preserved). */
function chronological(
  a: SeasonEntry,
  b: SeasonEntry,
): number {
  return compareLists(keyOf(a), keyOf(b));
}

function keyOf(entry: SeasonEntry): [number, number, number] {
  return [
    entry.seasonYear ?? Number.POSITIVE_INFINITY,
    entry.season ? (SEASON_ORDER[entry.season] ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY,
    parseReliableSeasonNumber(
      entry.titleEnglish,
      entry.title,
      entry.titleRomaji,
      entry.titleNative,
    ) ?? Number.POSITIVE_INFINITY,
  ];
}

function compareLists(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function toCard(
  entry: SeasonEntry,
  groupLabel: string,
  isCurrent: boolean,
  yearOverride: number | null = null,
): SeasonCardModel {
  return {
    anilistId: entry.anilistId,
    title: entry.titleEnglish ?? entry.title ?? entry.titleRomaji ?? entry.titleNative ?? "Untitled",
    posterUrl: entry.images?.poster ?? null,
    coverUrl: entry.images?.cover ?? null,
    bannerUrl: entry.images?.banner ?? null,
    format: entry.format,
    year: isCurrent ? (yearOverride ?? entry.seasonYear) : entry.seasonYear,
    episodeCount: entry.episodes,
    seasonNumber: parseReliableSeasonNumber(
      entry.titleEnglish,
      entry.title,
      entry.titleRomaji,
      entry.titleNative,
    ),
    relationLabel:
      entry.relationLabel ??
      (entry.relationType !== null ? (RELATION_FALLBACK_LABEL[entry.relationType] ?? groupLabel) : groupLabel),
    isCurrent,
  };
}

/**
 * Season numbers are NEVER inferred from array position. They are extracted
 * only from explicit wording in the returned titles:
 *   - "… Season 2" / "Season 07"  (English)
 *   - "… 2nd Season" (ordinal style)
 *   - "第2期 / 第2季" (Japanese)
 *   - trailing standalone roman numerals ("Overlord II", "Fruits Basket II")
 *     — skipped when the numeral belongs to a Part/Movie/Special label.
 * Everything else returns null: those cards show the backend relationship
 * label instead ("Prequel"/"Sequel"), exactly as the season-label contract
 * requires for unreliable-number cases.
 */
export function parseReliableSeasonNumber(
  ...sources: Array<string | null>
): number | null {
  for (const text of sources) {
    if (!text) continue;
    const arabic =
      /\b(?:season|series)\s*[-–—:]?\s*(\d{1,2})\b/i.exec(text) ??
      /\b(\d{1,2})(?:st|nd|rd|th)\s+season\b/i.exec(text) ??
      /第\s*(\d{1,2})\s*[期季]/.exec(text);
    if (arabic) {
      const value = Number.parseInt(arabic[1], 10);
      if (value > 0) return value;
      continue;
    }
    if (/\b(?:part|movie|special|ova|ona|film|side|episode)\b/i.test(text)) {
      continue;
    }
    const roman = /\s([IVXivx]{1,4})\s*$/.exec(text.trim());
    if (roman) {
      const value = ROMAN_VALUE[roman[1].toUpperCase()];
      if (value !== undefined) return value;
    }
  }
  return null;
}

const ROMAN_VALUE: Record<string, number> = {
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
  X: 10,
  XI: 11,
  XII: 12,
};
