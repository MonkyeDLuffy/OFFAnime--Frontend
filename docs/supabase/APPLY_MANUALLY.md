# Supabase migrations — PENDING, apply via SQL Editor (ordered)

**Status as of 2026-11-02 (verified, not assumed):** the deployed backend runs
the new release (`requireUser`-guarded `/api/watchlist` answers live), but the
Supabase project is **missing the user-data/limiter tables**. Live evidence
(captured through the trusted proxy AND direct-to-backend with the real user
Bearer token — identical result):

```
GET/POST/DELETE /api/watchlist → 502 PROVIDER_ERROR
  details: operation=list|add|remove, upstreamStatus=404,
  upstreamCode=PGRST205 ("Could not find the table 'public.watchlist'
  in the schema cache")
```

## Fastest path (one paste)

Paste **`docs/supabase/apply-now.sql`** (in this folder) into
**Supabase Dashboard → SQL Editor → Run**. It is generated verbatim from the
backend's `supabase/migrations/*` in dependency order (profiles baseline →
cache_entries → fix_cache_entries → auth_rate_limits → auth_signup_dedupe →
watchlist); every section is idempotent, so it is safe on a partially-migrated
project and safe to re-run.

`public.watchlist` is therefore **confirmed absent**. The DB-backed limiter
tables (`auth_attempt_limits`, `auth_signup_dedupe`) back the same commit and
are presumed absent with it (their absence is fail-open — throttling is
simply inactive; nothing errors client-side). The state of `cache_entries`
(Sept migration) could not be probed directly (no backend-env access from this
machine); if it was never applied either, the L2 cache is off and the backend
runs L1-only (also fail-open).

**There is NO supabase CLI, psql, or project token on this machine and none was
created — applying requires a human with Dashboard/SQL Editor access.** Do
NOT run anything outside the SQL Editor; do not modify the backend migrations.

## Order (dependency-safe, each file is idempotent and re-runnable)

All files live in the backend repository: `supabase/migrations/`.

| # | File | Purpose |
| - | ---- | ------- |
| 0 | `20260101000000_create_user_profiles_rls.sql` | profiles baseline (likely already applied — check first, skip if `public.profiles` exists) |
| 1 | `20260913000000_create_cache_entries.sql` | L2 cache table (skip if already applied — check `public.cache_entries`) |
| 2 | `20261102000000_fix_cache_entries.sql` | hardens cache_entries: dedupes rows, enforces NOT NULL, **creates the required unique (namespace, cache_key) index** for `on_conflict=namespace,cache_key` upserts, service_role grants, RLS lockdown |
| 3 | `20261102000001_auth_rate_limits.sql` | `auth_attempt_limits` + atomic `register_auth_attempt` RPC (advisory-lock serialized), `clear_auth_attempts`, cleanup fn |
| 4 | `20261102000002_auth_signup_dedupe.sql` | `auth_signup_dedupe` + cleanup fn |
| 5 | `20261102000003_watchlist.sql` | `public.watchlist` (PK (user_id, anime_id), RLS: select/insert/delete own rows via `auth.uid()`), grants to `authenticated` only |

Paste each file into **Supabase Dashboard → SQL Editor → Run**, in that order
(2 must come after 1 if 1 was absent; 3–5 are independent of each other; every
step is safe to re-run).

## Verify after applying (paste into SQL Editor)

```sql
-- Tables exist
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('profiles','cache_entries','auth_attempt_limits','auth_signup_dedupe','watchlist');

-- The CRITICAL unique index for atomic cache upserts
select indexname from pg_indexes
 where schemaname='public' and tablename='cache_entries'
   and indexname='cache_entries_namespace_cache_key_uidx';

-- Watchlist RLS is enforced (rls_enabled = t)
select c.relname, c.relrowsecurity as rls_enabled
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'watchlist';

-- Watchlist policies exist (select/insert/delete own)
select policyname, cmd from pg_policies
 where schemaname='public' and tablename='watchlist';

-- RPCs exist
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('register_auth_attempt','clear_auth_attempts','cleanup_expired_attempt_limits','cleanup_stale_signup_dedupe','cleanup_expired_cache_entries');
```

## Then run the backend's own probes (needs backend env access — Vercel shell or a machine with the project's `.env`)

```bash
node scripts/supabase-diagnose.js   # probes cache read/write/upsert-on-conflict, limiter RPC, watchlist w/ anon key
node scripts/supabase-smoke.js --clear-test-key   # L2 set→get→update→delete on a dedicated smoke key, then cleans it
```

Expected: `ALL PROBES PASSED…` from the diagnose script; the smoke test's key
(`smoke:test:phase6`) lives in a dedicated diagnostic key and is removed by the
flag — no fake anime rows are ever written.

## Security rules encoded in these migrations (do not relax)

- `cache_entries` + limiter tables: RLS on, **service_role only** (anon/authenticated revoked).
- `watchlist`: RLS keyed on `auth.uid()`; grants ONLY to `authenticated` (the backend forwards the verified user's access token for it — never the service-role key); anon revoked; no update policy (immutable entries).
