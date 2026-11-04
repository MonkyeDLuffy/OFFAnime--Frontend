# Watchlist backend contract — STATUS: IMPLEMENTED UPSTREAM

Verified 2026-11-02 against the backend repository (`MonkyeDLuffy/OFFAnime-Backend-`,
commit `0303ccc "Add supabase cache, auth throttle, watchlist, migrations, and tests"`)
— source files, not docs:

- `src/routes/watchlist.routes.js` — routes + guards:
  `GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/:animeId`,
  each behind `requireUser()` (upstream-verified Supabase session);
  POST/DELETE also sit behind `csrfOriginGuard()`.
- `src/controllers/watchlist.controller.js` — exact response shapes (below).
- `src/services/watchlist.service.js` — storage + identity security.
- `supabase/migrations/20261102000003_watchlist.sql` — `public.watchlist`
  table + RLS (auth.uid() keyed, PK (user_id, anime_id)).

The frontend is fully wired to this contract (same-origin proxy injects the
server-side API key and forwards the session; identity is derived by the
backend from the verified session — no userId ever crosses from the browser).

---

## Real contract (as implemented)

### GET /api/watchlist

200: `{ items, count }` — `items` newest first, capped at 1000 rows:
```json
{ "items": [{ "animeId": 1535, "addedAt": "2026-11-02T12:00:00+00:00" }], "count": 1 }
```

### POST /api/watchlist

Body `{ "animeId": 1535 }` (AniList ID, positive integer — the canonical
identity; nothing else is stored or required).

- 201 first add: `{ "added": true, "animeId": 1535, "addedAt": "…" }`
- 200 idempotent repeat: `{ "added": false, "animeId": 1535, "addedAt": null }`
  (the original `added_at` is never overwritten).

### DELETE /api/watchlist/:animeId

Idempotent — removing an absent id is still a success:

- 200 `{ "ok": true, "animeId": 1535 }`

### Errors (backend standard envelope `{ "error": { "code", "message" } }`)

| Situation | status | code |
| --- | --- | --- |
| No session presented | 401 | `UNAUTHORIZED_ERROR` |
| Session expired/revoked (fails upstream verify) | 401 | `AUTH_SESSION_EXPIRED` |
| Malformed/missing `animeId` | 400 | `VALIDATION_ERROR` |
| Watchlist storage (Supabase) failing | 502 | `PROVIDER_ERROR` |
| Cross-site cookie-authenticated mutation (CSRF guard) | 403 | `FORBIDDEN_ERROR` |

The frontend maps 401s to `session-expired` (with the documented
refresh-once-then-retry), 429s to `rate-limited`, and everything else to an
honest `unavailable` degrade (optimistic change reverted).

---

## Storage & security model (backend side, verified)

- `public.watchlist(user_id uuid→auth.users, anime_id bigint>0, added_at
  timestamptz)`; PK `(user_id, anime_id)` ⇒ one row per user+anime.
- RLS: `watchlist_select_own` / `watchlist_insert_own` / `watchlist_delete_own`
  keyed on `auth.uid()`; anon has no grants; no update policy (immutable rows).
- The backend queries PostgREST **as the user** (`apikey: anon` +
  `Authorization: Bearer <verified access token>`), so Postgres RLS is the
  boundary — the service-role key is never used for user data; user_id comes
  only from the verified session (request-supplied ids are ignored).
- Display metadata (title/poster/year/format) is intentionally NOT stored:
  the frontend hydrates it through the existing `/api/details/:id` endpoint.

## Frontend mapping (implemented)

- Proxy allowlist (`src/app/api/[...path]/route.ts`): `watchlist` and
  `watchlist/:animeId` with GET/POST/DELETE explicitly exported; the session
  rides in the HttpOnly cookie (the proxy adds NO Origin/Referer — the
  backend treats header-less mutations as server-to-server, which the CSRF
  guard allows by design).
- Client (`src/lib/watchlist/api-client.ts`): exact shapes above;
  refresh-once-then-retry on 401; POST accepts both 200 and 201.
- Store (`watchlist-context.tsx`): optimistic add/remove keyed by `animeId`
  with exact revert; first-add adopts the server's `addedAt` (201) so
  ordering matches every device; in-flight dedupe per id; identity guards
  purge per user on sign-out.
- Guest intent (pending.ts): the attempted save is preserved in
  sessionStorage as `{ animeId, title?, posterUrl?, year?, format? }`
  (metadata is for instant UI only) and completed once after sign-in.
