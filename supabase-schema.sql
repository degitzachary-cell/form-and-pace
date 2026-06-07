-- ═════════════════════════════════════════════════════════════════════════════
-- AUTHORITATIVE SCHEMA SNAPSHOT  —  public schema
--
-- This file is the source of truth for the database. It was reconciled against
-- the live project (lsrxqviwgqjpuzzcqcpu) on 2026-06-07 and reproduces the live
-- structure when run on a fresh Supabase project: tables, columns, constraints,
-- indexes, functions, the role guard trigger, RLS policies, and the realtime
-- publication.
--
-- Run order on a fresh project: this file ALONE is sufficient. The individual
-- `supabase-*-setup.sql` / `*-migration.sql` files remain as the historical
-- record of how the schema evolved; this snapshot supersedes them.
--
-- Idempotent: safe to re-run. Prerequisites: the Supabase `vault` extension
-- (for get_vault_secret) and `auth` schema (Supabase-managed) already exist.
--
-- NOTE: the live DB also carries some REDUNDANT DUPLICATE policies from past
-- dashboard edits (two policies expressing the same rule). They are harmless
-- (permissive policies OR together) but noisy. The "OPTIONAL: dedupe live"
-- block at the very bottom drops them so live exactly matches this file.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── Functions ────────────────────────────────────────────────────────────────
-- Coach predicate: single source of truth for "is the caller a coach".
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where email = (auth.jwt() ->> 'email') and role = 'coach'
  );
$$;
revoke all on function public.is_coach() from public;
revoke all on function public.is_coach() from anon;
grant execute on function public.is_coach() to authenticated;  -- RLS policies call it

-- Role-escalation guard (trigger fn). Requests with no end-user JWT (service
-- role, SQL editor, dashboard) pass through; logged-in users can't create/raise
-- a profile to a non-athlete role unless they are already a coach.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text := auth.jwt() ->> 'email';
begin
  if caller_email is null then
    return NEW;
  end if;
  if TG_OP = 'INSERT' then
    if coalesce(NEW.role, 'athlete') <> 'athlete' and not public.is_coach() then
      raise exception 'Only a coach may create a non-athlete profile';
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.role is distinct from OLD.role and not public.is_coach() then
      raise exception 'Only a coach may change a profile role';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_profile_role() from public;
revoke all on function public.guard_profile_role() from anon;
revoke all on function public.guard_profile_role() from authenticated;  -- trigger only

-- Vault helper. SECURITY DEFINER reads decrypted secrets, so it must NOT be
-- callable with the public anon key or by ordinary signed-in users — only the
-- service role / postgres (which bypass these grants).
create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;
revoke all on function public.get_vault_secret(text) from public;
revoke all on function public.get_vault_secret(text) from anon;
revoke all on function public.get_vault_secret(text) from authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  email          text primary key,
  role           text not null default 'athlete',  -- 'athlete' | 'coach'
  name           text,
  avatar         text,
  goal           text,
  current_pb     text,
  created_at     timestamptz default now(),
  pbs            jsonb,
  goals          jsonb,
  threshold_pace text,
  pace_unit      text default 'km' check (pace_unit = any (array['km','mi']))
);

create table if not exists public.session_logs (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null unique,
  athlete_email   text not null,
  athlete_name    text,
  feedback        text,
  analysis        jsonb,
  coach_reply     text,
  updated_at      timestamptz default now(),
  strava_data     jsonb,
  coach_read_at   timestamptz,
  athlete_read_at timestamptz,
  messages        jsonb not null default '[]'::jsonb
);

create table if not exists public.activities (
  id                 uuid primary key default gen_random_uuid(),
  athlete_email      text not null,
  athlete_name       text,
  activity_date      date not null,
  distance_km        numeric default 0,
  duration_seconds   integer,
  activity_type      text default 'Run',
  notes              text,
  source             text default 'manual',
  created_at         timestamptz default now(),
  strava_data        jsonb,
  coach_notes        text,
  coach_reply        text,
  coach_read_at      timestamptz,
  athlete_read_at    timestamptz,
  rtss               numeric,
  messages           jsonb not null default '[]'::jsonb,
  strava_activity_id text generated always as (strava_data ->> 'id') stored
);

create table if not exists public.coach_plans (
  id            uuid primary key default gen_random_uuid(),
  athlete_email text not null unique,
  plan_json     jsonb not null,
  updated_at    timestamptz default now()
);

create table if not exists public.strava_tokens (
  id                uuid primary key default gen_random_uuid(),
  athlete_email     text not null unique,
  access_token      text not null,
  refresh_token     text not null,
  expires_at        bigint not null,
  strava_athlete_id bigint,
  updated_at        timestamptz default now()
);

create table if not exists public.monthly_summaries (
  id            uuid primary key default gen_random_uuid(),
  athlete_email text not null,
  block_start   text not null,
  summary       jsonb not null,
  generated_at  timestamptz default now(),
  unique (athlete_email, block_start)
);

create table if not exists public.workout_templates (
  id          uuid primary key default gen_random_uuid(),
  coach_email text not null,
  name        text not null,
  type        text,
  tag         text,
  description text,
  pace        text,
  terrain     text,
  created_at  timestamptz default now(),
  steps       jsonb,
  exercises   jsonb
);

create table if not exists public.calendar_markers (
  id               uuid primary key default gen_random_uuid(),
  athlete_email    text not null,
  marker_date      date not null,
  end_date         date,
  kind             text not null check (kind = any (array['race','sick','taper','travel','other'])),
  label            text,
  is_a_race        boolean default false,
  created_by_email text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_email   text not null,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  device_label text,
  created_at   timestamptz default now(),
  last_seen_at timestamptz default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create unique index if not exists activities_unique_strava_per_athlete
  on public.activities (athlete_email, strava_activity_id);
create index if not exists activities_email_date_idx
  on public.activities (athlete_email, activity_date desc);
create index if not exists activities_athlete_unread_idx
  on public.activities (athlete_email) where (coach_reply is not null and athlete_read_at is null);
create index if not exists session_logs_email_idx
  on public.session_logs (athlete_email);
create index if not exists session_logs_athlete_unread_idx
  on public.session_logs (athlete_email) where (coach_reply is not null and athlete_read_at is null);
create index if not exists monthly_summaries_email_idx
  on public.monthly_summaries (athlete_email);
create index if not exists calendar_markers_athlete_date_idx
  on public.calendar_markers (athlete_email, marker_date);
create index if not exists workout_templates_coach_email_idx
  on public.workout_templates (coach_email);
create index if not exists idx_push_subscriptions_email
  on public.push_subscriptions (user_email);

-- ── Trigger ──────────────────────────────────────────────────────────────────
drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.session_logs       enable row level security;
alter table public.activities         enable row level security;
alter table public.coach_plans        enable row level security;
alter table public.strava_tokens      enable row level security;
alter table public.monthly_summaries  enable row level security;
alter table public.workout_templates  enable row level security;
alter table public.calendar_markers   enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated" on public.profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_insert_self_or_coach" on public.profiles;
create policy "profiles_insert_self_or_coach" on public.profiles
  for insert with check (lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach());
drop policy if exists "profiles_update_self_or_coach" on public.profiles;
create policy "profiles_update_self_or_coach" on public.profiles
  for update using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach())
            with check (lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach());

-- session_logs
drop policy if exists "session_logs_athlete_all" on public.session_logs;
create policy "session_logs_athlete_all" on public.session_logs
  for all using (lower(athlete_email) = lower(auth.jwt() ->> 'email'))
          with check (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "session_logs_coach_select" on public.session_logs;
create policy "session_logs_coach_select" on public.session_logs for select using (public.is_coach());
drop policy if exists "session_logs_coach_insert" on public.session_logs;
create policy "session_logs_coach_insert" on public.session_logs for insert with check (public.is_coach());
drop policy if exists "session_logs_coach_update" on public.session_logs;
create policy "session_logs_coach_update" on public.session_logs for update using (public.is_coach()) with check (public.is_coach());
drop policy if exists "session_logs_coach_delete" on public.session_logs;
create policy "session_logs_coach_delete" on public.session_logs for delete using (public.is_coach());

-- activities
drop policy if exists "activities_athlete_all" on public.activities;
create policy "activities_athlete_all" on public.activities
  for all using (lower(athlete_email) = lower(auth.jwt() ->> 'email'))
          with check (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "activities_coach_select" on public.activities;
create policy "activities_coach_select" on public.activities for select using (public.is_coach());
drop policy if exists "activities_coach_update" on public.activities;
create policy "activities_coach_update" on public.activities for update using (public.is_coach()) with check (public.is_coach());
drop policy if exists "activities_coach_delete" on public.activities;
create policy "activities_coach_delete" on public.activities for delete using (public.is_coach());

-- coach_plans
drop policy if exists "coach_plans_athlete_select" on public.coach_plans;
create policy "coach_plans_athlete_select" on public.coach_plans
  for select using (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "coach_plans_coach_all" on public.coach_plans;
create policy "coach_plans_coach_all" on public.coach_plans
  for all using (public.is_coach()) with check (public.is_coach());

-- strava_tokens
drop policy if exists "strava_tokens_user_all" on public.strava_tokens;
create policy "strava_tokens_user_all" on public.strava_tokens
  for all using (lower(athlete_email) = lower(auth.jwt() ->> 'email'))
          with check (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "strava_tokens_coach_select" on public.strava_tokens;
create policy "strava_tokens_coach_select" on public.strava_tokens for select using (public.is_coach());

-- monthly_summaries
drop policy if exists "monthly_summaries_athlete_select" on public.monthly_summaries;
create policy "monthly_summaries_athlete_select" on public.monthly_summaries
  for select using (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "monthly_summaries_coach_select" on public.monthly_summaries;
create policy "monthly_summaries_coach_select" on public.monthly_summaries for select using (public.is_coach());
drop policy if exists "monthly_summaries_coach_all" on public.monthly_summaries;
create policy "monthly_summaries_coach_all" on public.monthly_summaries
  for all using (public.is_coach()) with check (public.is_coach());

-- calendar_markers
drop policy if exists "calendar_markers_athlete_all" on public.calendar_markers;
create policy "calendar_markers_athlete_all" on public.calendar_markers
  for all using (lower(athlete_email) = lower(auth.jwt() ->> 'email'))
          with check (lower(athlete_email) = lower(auth.jwt() ->> 'email'));
drop policy if exists "calendar_markers_coach_all" on public.calendar_markers;
create policy "calendar_markers_coach_all" on public.calendar_markers
  for all using (public.is_coach()) with check (public.is_coach());

-- workout_templates
drop policy if exists "workout_templates_coach_all" on public.workout_templates;
create policy "workout_templates_coach_all" on public.workout_templates
  for all using (public.is_coach() and lower(coach_email) = lower(auth.jwt() ->> 'email'))
          with check (public.is_coach() and lower(coach_email) = lower(auth.jwt() ->> 'email'));

-- push_subscriptions
drop policy if exists "push_subscriptions_user_all" on public.push_subscriptions;
create policy "push_subscriptions_user_all" on public.push_subscriptions
  for all using (lower(user_email) = lower(auth.jwt() ->> 'email'))
          with check (lower(user_email) = lower(auth.jwt() ->> 'email'));

-- ── Realtime publication ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['session_logs','activities','coach_plans','calendar_markers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- OPTIONAL: dedupe live  — run once against an existing project to drop the
-- redundant duplicate policies left by past dashboard edits, so the live DB
-- matches the canonical set above. No-ops on a fresh install.
-- ═════════════════════════════════════════════════════════════════════════════
-- drop policy if exists "Coaches can read all activities"   on public.activities;
-- drop policy if exists "Coaches read all activities"       on public.activities;
-- drop policy if exists "Coaches can update activities"     on public.activities;
-- drop policy if exists "Coaches update any activity"       on public.activities;
-- drop policy if exists "Coaches delete any activity"       on public.activities;
-- drop policy if exists "Athletes manage own activities"    on public.activities;
-- drop policy if exists "Coaches can read all logs"         on public.session_logs;
-- drop policy if exists "Coaches read all logs"             on public.session_logs;
-- drop policy if exists "Coaches can update all logs"       on public.session_logs;
-- drop policy if exists "Coaches update all logs"           on public.session_logs;
-- drop policy if exists "Coaches can insert session logs"   on public.session_logs;
-- drop policy if exists "Coaches insert any log"            on public.session_logs;
-- drop policy if exists "Coaches delete any log"            on public.session_logs;
-- drop policy if exists "Athletes manage own logs"          on public.session_logs;
-- drop policy if exists "Coaches can manage all plans"      on public.coach_plans;
-- drop policy if exists "Athletes can read own plan"        on public.coach_plans;
-- drop policy if exists "Users manage own strava tokens"    on public.strava_tokens;
-- drop policy if exists "Coaches read strava tokens"        on public.strava_tokens;
-- drop policy if exists "Athletes can read own summaries"   on public.monthly_summaries;
-- drop policy if exists "Coach can read all summaries"      on public.monthly_summaries;
-- drop policy if exists "Coach can write summaries"         on public.monthly_summaries;
-- drop policy if exists "Athletes manage own markers"       on public.calendar_markers;
-- drop policy if exists "Coaches manage all markers"        on public.calendar_markers;
-- drop policy if exists "calendar_markers_select"           on public.calendar_markers;
-- drop policy if exists "calendar_markers_insert"           on public.calendar_markers;
-- drop policy if exists "calendar_markers_update"           on public.calendar_markers;
-- drop policy if exists "calendar_markers_delete"           on public.calendar_markers;
-- drop policy if exists "Coaches manage own templates"      on public.workout_templates;
-- drop policy if exists "coach reads own templates"         on public.workout_templates;
-- drop policy if exists "coach inserts own templates"       on public.workout_templates;
-- drop policy if exists "coach deletes own templates"       on public.workout_templates;
-- drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
-- drop policy if exists "users can manage own push subscriptions" on public.push_subscriptions;
-- drop policy if exists "Users insert own profile"          on public.profiles;
-- drop policy if exists "Users can insert own or coach insert any" on public.profiles;
-- drop policy if exists "Users update own profile"          on public.profiles;
-- drop policy if exists "Users can update own or coach update any" on public.profiles;
-- drop policy if exists "Authenticated users can read profiles" on public.profiles;
