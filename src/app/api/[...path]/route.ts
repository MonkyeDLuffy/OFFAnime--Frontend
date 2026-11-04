import { NextResponse, type NextRequest } from "next/server";

/**
 * Secure server-side proxy for the OffAnime backend (backend.md §10).
 *
 * - The backend base URL and API secret are read ONLY from server environment
 *   variables (`OFFANIME_BACKEND_URL`, `BACKEND_API_SECRET`) and are never
 *   exposed to the browser or logs.
 * - Restricted to the documented `/api/*` paths and methods — never an open
 *   proxy. The secret is injected here, client-supplied credentials for the
 *   backend API key are ignored.
 * - Preserves upstream status codes, JSON error bodies and `Set-Cookie`
 *   headers (needed later for `/api/auth/*` session flows).
 * - Timeouts and upstream failures are converted into the backend's stable
 *   error shape instead of hanging or crashing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BACKEND_URL_ENV = "OFFANIME_BACKEND_URL";
const BACKEND_SECRET_ENV = "BACKEND_API_SECRET";

const UPSTREAM_TIMEOUT_MS = 15_000;

/** GET/HEAD-allowlisted paths, relative to `/api` (backend.md §6). */
const ALLOWED_READ_PATH =
  /^(?:health|home|schedule|search|top-search|details|smart\/details|episodes|recommendations|seasons|category|stream\/resolve|stream\/mal|jikan\/anime|jikan\/from-anilist|tmdb)(?:\/.*)?$/;

/** Auth endpoints additionally accept POST bodies (backend.md §6). */
const ALLOWED_AUTH_PATH = /^auth(?:\/.*)?$/;

/**
 * User-data endpoints — the REAL account watchlist and continue-watching
 * history (backend.md §watchlist; src/routes/watchlist.routes.js,
 * src/routes/continue-watching.routes.js). The backend derives identity
 * ONLY from the verified session and enforces RLS, so the proxy must simply
 * forward the session with the injected API key. DELETE is required for
 * removal; paths are strictly bounded (`watchlist`, `watchlist/:animeId`,
 * `user/continue-watching`, `user/continue-watching/:anilistId` only — never
 * an open proxy).
 */
const ALLOWED_USER_DATA_PATH =
  /^(?:watchlist(?:\/\d+)?|user\/continue-watching(?:\/\d+)?)$/;

function proxyError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

async function proxyRequest(request: NextRequest): Promise<NextResponse> {
  const baseUrl = process.env[BACKEND_URL_ENV]?.trim();
  const secret = process.env[BACKEND_SECRET_ENV]?.trim();

  if (!baseUrl || !secret) {
    return proxyError(
      500,
      "PROXY_NOT_CONFIGURED",
      "The OffAnime backend proxy is not configured. Set OFFANIME_BACKEND_URL and BACKEND_API_SECRET in the server environment.",
    );
  }

  const method = request.method.toUpperCase();
  const relativePath = request.nextUrl.pathname
    .replace(/^\/api/, "")
    .replace(/^\/+|\/+$/g, "");

  const isAuthPath = ALLOWED_AUTH_PATH.test(relativePath);
  const isReadPath = ALLOWED_READ_PATH.test(relativePath);
  const isUserDataPath = ALLOWED_USER_DATA_PATH.test(relativePath);

  if (!isAuthPath && !isReadPath && !isUserDataPath) {
    return proxyError(404, "NOT_FOUND", "Requested path is not allowlisted.");
  }

  const allowedMethods = isAuthPath
    ? ["GET", "POST"]
    : isUserDataPath
      ? ["GET", "POST", "DELETE"] // real watchlist: read, add, remove
      : ["GET", "HEAD"];
  if (!allowedMethods.includes(method)) {
    return proxyError(
      405,
      "METHOD_NOT_ALLOWED",
      `Method ${method} is not allowed for this path.`,
    );
  }

  // The proxy authenticates with its own header; a client-supplied `api_key`
  // query parameter is stripped so it can never conflict upstream (401s).
  const searchParams = new URLSearchParams(request.nextUrl.search);
  searchParams.delete("api_key");
  const query = searchParams.toString();

  const upstreamUrl = `${baseUrl.replace(/\/+$/, "")}/api/${relativePath}${query ? `?${query}` : ""}`;

  const headers: Record<string, string> = {
    accept: "application/json",
    "x-api-key": secret,
  };
  const contentType = request.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  // Pass the user session token through (never treated as the API key) and
  // cookies for future /api/auth/* cookie sessions (backend.md §10).
  const authorization = request.headers.get("authorization");
  if (authorization) headers.authorization = authorization;
  const cookie = request.headers.get("cookie");
  if (cookie) headers.cookie = cookie;

  let body: string | undefined;
  if (method === "POST") {
    body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: method === "HEAD" ? "GET" : method,
      headers,
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      return proxyError(504, "TIMEOUT_ERROR", "The OffAnime backend did not respond in time.");
    }
    return proxyError(502, "UPSTREAM_UNAVAILABLE", "The OffAnime backend is unreachable.");
  }

  const responseHeaders = new Headers();
  responseHeaders.set("cache-control", "no-store");
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) responseHeaders.set("x-request-id", requestId);
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  const responseBody = method === "HEAD" ? null : await upstream.arrayBuffer();
  return new NextResponse(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
/** Watchlist removal (DELETE /api/watchlist/:animeId) — explicitly exported. */
export const DELETE = proxyRequest;
