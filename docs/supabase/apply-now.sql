-- =============================================================================
-- OFFANIME Supabase — COMPLETE ORDERED MIGRATIONS (one-paste SQL Editor run)
-- Generated 2026-11-02 from the OFFAnime-Backend- repo,
-- commit 0303ccc, supabase/migrations/* (VERBATIM, dependency order).
-- Every section is idempotent (if not exists / create or replace):
-- re-running this file is always safe.
-- =============================================================================

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20260101000000_create_user_profiles_rls.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: user profiles table with row-level security (RLS baseline)
-- -----------------------------------------------------------------------------
-- One-time manual step (no supabase CLI required):
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run
--   (or: supabase db push, if using the CLI)
--
-- PURPOSE
--   Baseline for user-owned data that is SEPARATE from Supabase Auth
--   credentials (auth.users). Profile/business data must never live in the
--   auth schema, and every user-owned table MUST enable RLS with policies
--   keyed on auth.uid() so one user can never read or modify another user's
--   rows by changing an ID in a request.
--
-- HOW THE BACKEND INTERACTS WITH THIS TABLE
--   The backend authenticates users through Supabase Auth (GoTrue) using the
--   PUBLIC anon key ONLY - never the service-role key. When a backend feature
--   needs user-owned rows, it MUST forward the user's access token to
--   PostgREST:
--       Authorization: Bearer <user access token>
--       apikey: <anon key>
--   PostgREST then evaluates RLS AS THAT USER (auth.uid() = the token's sub).
--   The backend MUST NOT query user-owned tables with the service-role key
--   (that bypasses RLS entirely and would let any caller read any user's data).
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent: if not exists / drop policy if exists).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profiles: one row per user, keyed by the Supabase Auth user UUID.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- RLS is the security boundary. NEVER ship a user-owned table with RLS
-- disabled, and never disable it "temporarily".
alter table public.profiles enable row level security;

-- Users can read ONLY their own row (auth.uid() comes from the verified JWT).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Users can insert ONLY their own row (id must equal their own auth uid).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- Users can update ONLY their own row.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No delete policy: profile rows follow the auth user via on delete cascade.
-- (Add an explicit policy only if self-service deletion is a product need.)

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- TEMPLATE for ANY future user-owned table (favorites, watch history, ...):
--
--   create table public.<table> (
--     id         bigint generated always as identity primary key,
--     user_id    uuid not null references auth.users (id) on delete cascade,
--     ...
--   );
--   alter table public.<table> enable row level security;
--   create policy "<table>_all_own" on public.<table>
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
--
-- RULES:
--   * every row carries user_id; every policy compares it to auth.uid().
--   * RLS enabled BEFORE the table accepts production data.
--   * the backend forwards the USER's access token for these queries
--     (anon key + Bearer) - the service-role key is for the L2 cache table
--     only (cache_entries has no user data and is not exposed via the API).
-- =============================================================================
-- <<<<<<<<<<<<<< END FILE: 20260101000000_create_user_profiles_rls.sql >>>>>>>>>>>>>>

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20260913000000_create_cache_entries.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: create the Supabase L2 cache table (cache_entries)
-- -----------------------------------------------------------------------------
-- One-time manual step (no supabase CLI required):
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run
--   (or: supabase db push, if using the CLI)
--
-- This table is the persistent, shared L2 cache that works across serverless
-- instances. It is a cache layer ONLY - never a source of truth. Provider
-- failures are never stored here as successful values.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cache table
-- -----------------------------------------------------------------------------
-- namespace      explicit namespace segment (e.g. anilist, jikan, tmdb,
--                identity, cache) - keeps provider namespaces isolated
-- cache_key      explicit key within the namespace (e.g. anime:123)
-- value          normalized application data (jsonb) - never raw provider
--                HTTP responses, never secrets
-- ttl_seconds    fresh TTL used when the entry was written
-- expires_at     fresh until this instant (timestamptz)
-- stale_until    stale-if-error usable until this instant (timestamptz);
--                stale data is served ONLY when the provider operation fails
-- created_at     preserved across upserts (default now() on insert)
-- updated_at     set by the application on every upsert
create table if not exists public.cache_entries (
  id           bigint generated always as identity primary key,
  namespace    text        not null,
  cache_key    text        not null,
  value        jsonb       not null,
  ttl_seconds  integer     not null default 300,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  stale_until  timestamptz not null
);

-- -----------------------------------------------------------------------------
-- Uniqueness on the logical cache identity (namespace, cache_key)
-- -----------------------------------------------------------------------------
-- Enables ATOMIC upserts (PostgREST Prefer: resolution=merge-duplicates) so
-- concurrent serverless instances can populate the same key safely without a
-- SELECT-then-INSERT race. A numeric ID equal across providers does NOT mean
-- the entities are equal - the namespace column keeps them isolated.
create unique index if not exists cache_entries_namespace_cache_key_uidx
  on public.cache_entries (namespace, cache_key);

-- -----------------------------------------------------------------------------
-- Expiration / stale cleanup lookups
-- -----------------------------------------------------------------------------
create index if not exists cache_entries_expires_at_idx
  on public.cache_entries (expires_at);

create index if not exists cache_entries_stale_until_idx
  on public.cache_entries (stale_until);

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
-- The backend writes/reads with the service-role key (which bypasses RLS and
-- stays server-side). Enabling RLS with NO policies means anonymous/public
-- access is denied by default.
alter table public.cache_entries enable row level security;

-- -----------------------------------------------------------------------------
-- Optional serverless-friendly cleanup (NOT required for correctness)
-- -----------------------------------------------------------------------------
-- Expired rows are handled lazily during reads; this function exists only for
-- an optional manual/rarely-scheduled SQL call. No backend worker, cron
-- daemon, setInterval(), or VPS process is required for basic cache
-- correctness.
create or replace function public.cleanup_expired_cache_entries()
returns integer
language plpgsql
as $$
declare
  deleted integer;
begin
  delete from public.cache_entries
  where stale_until < now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
-- <<<<<<<<<<<<<< END FILE: 20260913000000_create_cache_entries.sql >>>>>>>>>>>>>>

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20261102000000_fix_cache_entries.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: HARDEN the Supabase L2 cache table (cache_entries)
-- -----------------------------------------------------------------------------
-- WHY (production fix - the "Supabase cache read/write failed" logs):
--   1. "Supabase cache write failed" - the backend upsert sends
--      Prefer: resolution=merge-duplicates with an explicit
--      on_conflict=namespace,cache_key conflict target. That REQUIRES a
--      unique constraint/index on (namespace, cache_key); without it Postgres
--      raises 42P10 ("there is no unique or exclusion constraint matching the
--      ON CONFLICT specification") and (without the explicit target) PostgREST
--      falls back to the surrogate `id` primary key, so the second write for
--      the same logical key raises 23505 duplicate key. This migration
--      guarantees the required unique index (and deduplicates any rows that
--      accumulated while it was missing).
--   2. "Supabase cache read failed" - RLS is enabled on cache_entries with NO
--      policies, so the ANON key cannot read/write it at all (401). The
--      backend's L2 store now REQUIRES SUPABASE_SERVICE_ROLE_KEY and runs
--      L1-only otherwise; this migration keeps RLS locked down and makes the
--      service_role grants explicit.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent: if exists / if not exists).
-- Apply via: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Table (fresh installs get the final shape; existing installs repaired)
-- -----------------------------------------------------------------------------
create table if not exists public.cache_entries (
  id           bigint generated always as identity primary key,
  namespace    text        not null,
  cache_key    text        not null,
  value        jsonb       not null,
  ttl_seconds  integer     not null default 300,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  stale_until  timestamptz not null
);

-- -----------------------------------------------------------------------------
-- 2. Repair partially-existing tables: add any missing columns
-- -----------------------------------------------------------------------------
alter table public.cache_entries add column if not exists namespace   text;
alter table public.cache_entries add column if not exists cache_key   text;
alter table public.cache_entries add column if not exists value       jsonb;
alter table public.cache_entries add column if not exists ttl_seconds integer default 300;
alter table public.cache_entries add column if not exists created_at  timestamptz default now();
alter table public.cache_entries add column if not exists updated_at  timestamptz default now();
alter table public.cache_entries add column if not exists expires_at  timestamptz;
alter table public.cache_entries add column if not exists stale_until timestamptz;

-- -----------------------------------------------------------------------------
-- 3. Backfill legacy rows, then enforce NOT NULL + defaults
-- -----------------------------------------------------------------------------
update public.cache_entries
   set ttl_seconds = coalesce(ttl_seconds, 300),
       expires_at  = coalesce(expires_at, created_at, now()),
       stale_until = coalesce(stale_until, coalesce(expires_at, created_at, now()) + interval '24 hours'),
       created_at  = coalesce(created_at, now()),
       updated_at  = coalesce(updated_at, coalesce(created_at, now())),
       namespace   = coalesce(namespace, 'default'),
       cache_key   = coalesce(cache_key, 'legacy:' || id::text),
       value       = coalesce(value, 'null'::jsonb)
 where ttl_seconds is null or expires_at is null or stale_until is null
    or created_at is null or updated_at is null
    or namespace is null or cache_key is null or value is null;

alter table public.cache_entries alter column namespace   set not null;
alter table public.cache_entries alter column cache_key   set not null;
alter table public.cache_entries alter column value       set not null;
alter table public.cache_entries alter column ttl_seconds set not null;
alter table public.cache_entries alter column ttl_seconds set default 300;
alter table public.cache_entries alter column expires_at  set not null;
alter table public.cache_entries alter column stale_until set not null;

-- -----------------------------------------------------------------------------
-- 4. Deduplicate logical keys (keep the newest row per (namespace, cache_key))
-- -----------------------------------------------------------------------------
with ranked as (
  select id,
         row_number() over (
           partition by namespace, cache_key
           order by updated_at desc, id desc
         ) as rn
  from public.cache_entries
)
delete from public.cache_entries
 where id in (select id from ranked where rn > 1);

-- -----------------------------------------------------------------------------
-- 5. THE REQUIRED UNIQUE INDEX for atomic upserts
-- -----------------------------------------------------------------------------
-- Backs the backend's `?on_conflict=namespace,cache_key` +
-- `Prefer: resolution=merge-duplicates` upsert (INSERT ... ON CONFLICT
-- (namespace, cache_key) DO UPDATE) used by every cache write. Missing this
-- index is a hard write failure (42P10), not a performance issue.
create unique index if not exists cache_entries_namespace_cache_key_uidx
  on public.cache_entries (namespace, cache_key);

-- -----------------------------------------------------------------------------
-- 6. Expiration / stale cleanup lookups
-- -----------------------------------------------------------------------------
create index if not exists cache_entries_expires_at_idx
  on public.cache_entries (expires_at);

create index if not exists cache_entries_stale_until_idx
  on public.cache_entries (stale_until);

-- -----------------------------------------------------------------------------
-- 7. Row level security + explicit grants
-- -----------------------------------------------------------------------------
-- The backend reads/writes with the service-role key (bypasses RLS, stays
-- server-side). RLS with NO policies denies anon/authenticated by default;
-- the explicit revoke makes that guarantee independent of injected grants.
alter table public.cache_entries enable row level security;

revoke all on public.cache_entries from anon;
revoke all on public.cache_entries from authenticated;
grant select, insert, update, delete on public.cache_entries to service_role;

-- -----------------------------------------------------------------------------
-- 8. Optional serverless-friendly cleanup (NOT required for correctness)
-- -----------------------------------------------------------------------------
-- Expired rows are handled lazily during reads; this function exists only for
-- an optional manual/rarely-scheduled SQL call.
create or replace function public.cleanup_expired_cache_entries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  delete from public.cache_entries
  where stale_until < now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.cleanup_expired_cache_entries() from public;
revoke all on function public.cleanup_expired_cache_entries() from anon;
revoke all on function public.cleanup_expired_cache_entries() from authenticated;
grant execute on function public.cleanup_expired_cache_entries() to service_role;

-- -----------------------------------------------------------------------------
-- 9. Make PostgREST pick up the new constraint/index IMMEDIATELY
-- -----------------------------------------------------------------------------
-- Without this, upserts can behave as if the old schema were still cached
-- (transient 42P10 / wrong conflict target) until PostgREST refreshes.
notify pgrst, 'reload schema';
-- <<<<<<<<<<<<<< END FILE: 20261102000000_fix_cache_entries.sql >>>>>>>>>>>>>>

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20261102000001_auth_rate_limits.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: DB-backed auth attempt limiting (login lockout + IP layers)
-- -----------------------------------------------------------------------------
-- Backs src/services/auth-throttle.service.js. ATOMIC counters shared across
-- ALL serverless instances (in-memory counters are never the enforcement
-- mechanism): one row per bucket + one serialized RPC.
--
-- Bucket naming (opaque to the database):
--   login:email:<sha256>   failed logins per NORMALIZED account (hashed email)
--   login:ip:<ip>          failed logins per source IP (separate abuse layer)
--   signup:ip:<ip>         signup ATTEMPTS per source IP
--
-- Policy semantics enforced by register_auth_attempt (p_max_hits = N):
--   attempts 1..N register normally; attempt N+1 (hits > N) sets locked_until
--   and reports locked=true. Attempts DURING an active lock are recorded but
--   never extend the lock. An expired window resets the counter to 1.
--
-- The backend ALSO read-gates before calling GoTrue: a bucket with
-- hits >= N inside the (non-expired) window is blocked without registering a
-- new hit, so a locked account/IP receives a typed 429 with retry info.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent: if exists / create or replace).
-- Apply via: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.auth_attempt_limits (
  bucket            text        primary key,
  hits              integer     not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until      timestamptz,
  last_hit_at       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists auth_attempt_limits_last_hit_idx
  on public.auth_attempt_limits (last_hit_at);

-- RLS + grants: server-side abuse data. No anon/authenticated access at all.
alter table public.auth_attempt_limits enable row level security;

revoke all on public.auth_attempt_limits from anon;
revoke all on public.auth_attempt_limits from authenticated;
grant select, insert, update, delete on public.auth_attempt_limits to service_role;

-- -----------------------------------------------------------------------------
-- register_auth_attempt: atomic register-and-decide
-- -----------------------------------------------------------------------------
-- Returns jsonb: { hits, locked, retry_after_seconds }.
create or replace function public.register_auth_attempt(
  p_bucket text,
  p_max_hits integer,
  p_window_seconds integer,
  p_lock_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_attempt_limits;
  v_expired boolean;
  v_hits integer;
  v_window_started timestamptz;
  v_locked_until timestamptz;
begin
  -- Serialize the read-modify-write PER BUCKET across every serverless
  -- instance. The advisory lock is transaction-scoped: one RPC call is one
  -- implicit transaction, so concurrent registers increment exactly and
  -- atomically instead of racing.
  perform pg_advisory_xact_lock(hashtext('offanime-auth-attempt:' || p_bucket));

  select * into v_row from public.auth_attempt_limits where bucket = p_bucket;

  -- Active lock: record the attempt time but do NOT extend the cooldown
  -- (repeated attempts must not be able to prolong a lock) and report busy.
  if v_row.bucket is not null
     and v_row.locked_until is not null
     and v_row.locked_until > v_now then
    update public.auth_attempt_limits
       set last_hit_at = v_now, updated_at = v_now
     where bucket = p_bucket;
    return jsonb_build_object(
      'hits', v_row.hits,
      'locked', true,
      'retry_after_seconds',
        greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer)
    );
  end if;

  -- First ever hit for this bucket.
  if v_row.bucket is null then
    insert into public.auth_attempt_limits
      (bucket, hits, window_started_at, locked_until, last_hit_at, updated_at)
    values
      (p_bucket, 1, v_now, null, v_now, v_now);
    return jsonb_build_object('hits', 1, 'locked', false, 'retry_after_seconds', 0);
  end if;

  -- Count this hit: expired window -> fresh counter, otherwise increment.
  v_expired := v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds);
  v_hits := case when v_expired then 1 else v_row.hits + 1 end;
  v_window_started := case when v_expired then v_now else v_row.window_started_at end;
  -- Lock only AFTER the budget is spent: with p_max_hits = 5 the 5th hit
  -- registers normally (hits = 5); the 6th hit (hits = 6 > 5) triggers the
  -- lock-and-reject. A previous (now expired) lock is cleared on recovery.
  v_locked_until := case
    when v_hits > p_max_hits then v_now + make_interval(secs => p_lock_seconds)
    else null
  end;

  update public.auth_attempt_limits
     set hits = v_hits,
         window_started_at = v_window_started,
         locked_until = v_locked_until,
         last_hit_at = v_now,
         updated_at = v_now
   where bucket = p_bucket;

  return jsonb_build_object(
    'hits', v_hits,
    'locked', v_locked_until is not null,
    'retry_after_seconds', case when v_locked_until is not null then greatest(1, p_lock_seconds) else 0 end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- clear_auth_attempts: successful login resets the account counter
-- -----------------------------------------------------------------------------
create or replace function public.clear_auth_attempts(p_bucket text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('offanime-auth-attempt:' || p_bucket));
  delete from public.auth_attempt_limits where bucket = p_bucket;
end;
$$;

-- -----------------------------------------------------------------------------
-- cleanup_expired_attempt_limits: optional hygiene (no worker required)
-- -----------------------------------------------------------------------------
-- Deletes buckets that have not been touched recently and are not locked.
-- Run manually from the SQL editor or on a rare schedule.
create or replace function public.cleanup_expired_attempt_limits(p_keep_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  delete from public.auth_attempt_limits
   where last_hit_at < now() - make_interval(hours => greatest(p_keep_hours, 1))
     and (locked_until is null or locked_until < now());
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: service_role ONLY (never callable with an anon key)
-- -----------------------------------------------------------------------------
revoke all on function public.register_auth_attempt(text, integer, integer, integer) from public;
revoke all on function public.register_auth_attempt(text, integer, integer, integer) from anon;
revoke all on function public.register_auth_attempt(text, integer, integer, integer) from authenticated;
grant execute on function public.register_auth_attempt(text, integer, integer, integer) to service_role;

revoke all on function public.clear_auth_attempts(text) from public;
revoke all on function public.clear_auth_attempts(text) from anon;
revoke all on function public.clear_auth_attempts(text) from authenticated;
grant execute on function public.clear_auth_attempts(text) to service_role;

revoke all on function public.cleanup_expired_attempt_limits(integer) from public;
revoke all on function public.cleanup_expired_attempt_limits(integer) from anon;
revoke all on function public.cleanup_expired_attempt_limits(integer) from authenticated;
grant execute on function public.cleanup_expired_attempt_limits(integer) to service_role;

notify pgrst, 'reload schema';
-- <<<<<<<<<<<<<< END FILE: 20261102000001_auth_rate_limits.sql >>>>>>>>>>>>>>

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20261102000002_auth_signup_dedupe.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: signup duplicate-suppression markers (auth_signup_dedupe)
-- -----------------------------------------------------------------------------
-- Backs the "prevent duplicate signup requests from generating unnecessary
-- upstream calls" requirement (src/services/auth-throttle.service.js).
--
-- After a SUCCESSFUL signup the backend records a short-lived marker keyed by
-- the SHA-256 hash of the NORMALIZED email (no plaintext address is stored).
-- A repeated signup POST for the same address within the TTL responds 409
-- immediately, WITHOUT calling Supabase Auth again. Failed/rate-limited
-- signups never create a marker, so failures are never mistaken for success.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent: if exists / create or replace).
-- Apply via: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =============================================================================

create table if not exists public.auth_signup_dedupe (
  email_key  text        primary key,
  created_at timestamptz not null default now()
);

create index if not exists auth_signup_dedupe_created_at_idx
  on public.auth_signup_dedupe (created_at);

-- RLS + grants: server-side abuse data. No anon/authenticated access.
alter table public.auth_signup_dedupe enable row level security;

revoke all on public.auth_signup_dedupe from anon;
revoke all on public.auth_signup_dedupe from authenticated;
grant select, insert, update, delete on public.auth_signup_dedupe to service_role;

-- -----------------------------------------------------------------------------
-- cleanup_stale_signup_dedupe: optional hygiene (no worker required)
-- -----------------------------------------------------------------------------
-- Markers are only useful for a short window; run manually or on a rare
-- schedule. The default keeps one day of history.
create or replace function public.cleanup_stale_signup_dedupe(p_min_age_minutes integer default 1440)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  delete from public.auth_signup_dedupe
   where created_at < now() - make_interval(mins => greatest(p_min_age_minutes, 1));
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke all on function public.cleanup_stale_signup_dedupe(integer) from public;
revoke all on function public.cleanup_stale_signup_dedupe(integer) from anon;
revoke all on function public.cleanup_stale_signup_dedupe(integer) from authenticated;
grant execute on function public.cleanup_stale_signup_dedupe(integer) to service_role;

notify pgrst, 'reload schema';
-- <<<<<<<<<<<<<< END FILE: 20261102000002_auth_signup_dedupe.sql >>>>>>>>>>>>>>

-- <<<<<<<<<<<<<< BEGIN FILE: supabase/migrations/20261102000003_watchlist.sql >>>>>>>>>>>>>>
-- =============================================================================
-- Migration: watchlist (persistent, account-backed)
-- -----------------------------------------------------------------------------
-- One row per (user, anime). The anime identifier is the ANILIST ID - the
-- canonical identity of the existing anime API contract (never a MAL/TMDB id).
--
-- SECURITY MODEL (matches the profiles baseline):
--   - RLS is enabled with policies keyed on auth.uid(): a user can only ever
--     see/insert/delete THEIR OWN rows, even if a request tries to supply a
--     different user id.
--   - The backend FORWARDS the verified user's access token to PostgREST
--     (apikey: anon + Authorization: Bearer <user token>), so Postgres
--     evaluates RLS AS THAT USER. The service-role key is NEVER used for
--     user-owned data. The backend also derives user_id ONLY from the verified
--     session - a client-supplied user id is ignored.
--
-- API (backend):
--   GET    /api/watchlist            -> { items: [{ animeId, addedAt }], count }
--   POST   /api/watchlist {animeId}  -> 201 { added: true, ... } / 200 { added: false, ... }
--   DELETE /api/watchlist/:animeId   -> 200 { ok: true, animeId }
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent: if exists / drop policy if exists).
-- Apply via: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id  uuid        not null references auth.users (id) on delete cascade,
  -- AniList ID (canonical anime identity). Bigint for headroom; positive.
  anime_id bigint      not null check (anime_id > 0),
  added_at timestamptz not null default now(),
  -- Uniqueness per (user, anime) AND the index that makes the account-scoped
  -- list query O(log n). Doubles as the PostgREST upsert conflict target
  -- used for idempotent adds.
  primary key (user_id, anime_id)
);

-- Newest-first listing per user (the watchlist read path).
create index if not exists watchlist_user_added_at_idx
  on public.watchlist (user_id, added_at desc);

-- -----------------------------------------------------------------------------
-- Row level security: ONLY the owner can read/write their rows
-- -----------------------------------------------------------------------------
alter table public.watchlist enable row level security;

drop policy if exists "watchlist_select_own" on public.watchlist;
create policy "watchlist_select_own"
  on public.watchlist
  for select
  using (auth.uid() = user_id);

drop policy if exists "watchlist_insert_own" on public.watchlist;
create policy "watchlist_insert_own"
  on public.watchlist
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "watchlist_delete_own" on public.watchlist;
create policy "watchlist_delete_own"
  on public.watchlist
  for delete
  using (auth.uid() = user_id);

-- No update policy: entries are immutable (remove + re-add to change).

-- -----------------------------------------------------------------------------
-- Grants: the `authenticated` role (a verified user token via PostgREST).
-- anon never accesses this table; the backend never uses service_role here.
-- -----------------------------------------------------------------------------
grant select, insert, delete on public.watchlist to authenticated;
revoke update on public.watchlist from authenticated;
revoke all on public.watchlist from anon;

notify pgrst, 'reload schema';
-- <<<<<<<<<<<<<< END FILE: 20261102000003_watchlist.sql >>>>>>>>>>>>>>
