-- ─────────────────────────────────────────────────────────────────────────────
-- RLS ROLE-MODEL MIGRATION
--
-- Run this AFTER the base per-table setup files. Idempotent — safe to re-run.
--
-- What it does:
--   1. Introduces public.is_coach() — a single source of truth for "is the
--      caller a coach", keyed off profiles.role instead of hardcoded emails.
--   2. Rewrites every coach policy (session_logs, activities, coach_plans,
--      strava_tokens, monthly_summaries) to use it. Adds WITH CHECK to coach
--      writes. Removes the z.degit@gmail.com privilege-escalation grant.
--   3. Lets users create/edit their OWN profile (first-login + profile edit)
--      and coaches edit any athlete's — but blocks role escalation via a
--      trigger, so an athlete can never make themselves a coach.
--   4. Commits the schema + RLS for three tables that previously only existed
--      in the dashboard: calendar_markers, workout_templates, push_subscriptions.
--   5. Adds the indexes the roster-scoped / windowed client queries rely on.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Coach predicate ───────────────────────────────────────────────────────
-- SECURITY DEFINER so it can read profiles.role regardless of the caller's own
-- RLS view; STABLE so the planner can cache it within a statement. Reading
-- profiles inside an RLS policy / trigger is safe — SELECT doesn't re-fire RLS
-- recursively here because the function runs as its (privileged) owner.
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
grant execute on function public.is_coach() to authenticated;

-- ── 2. session_logs ──────────────────────────────────────────────────────────
drop policy if exists "Coaches can read all logs"      on session_logs;
drop policy if exists "Coaches can update all logs"     on session_logs;
drop policy if exists "Coaches can insert session logs" on session_logs;

create policy "Coaches can read all logs"
  on session_logs for select using (public.is_coach());
create policy "Coaches can update all logs"
  on session_logs for update using (public.is_coach()) with check (public.is_coach());
create policy "Coaches can insert session logs"
  on session_logs for insert with check (public.is_coach());

-- ── 3. activities ────────────────────────────────────────────────────────────
drop policy if exists "Coaches can read all activities" on activities;
drop policy if exists "Coaches can update activities"   on activities;

create policy "Coaches can read all activities"
  on activities for select using (public.is_coach());
create policy "Coaches can update activities"
  on activities for update using (public.is_coach()) with check (public.is_coach());

-- ── 4. coach_plans ───────────────────────────────────────────────────────────
-- Replaces the policy that hardcoded BOTH degitzachary@ and z.degit@ — the
-- latter is seeded as an athlete, so that grant let an athlete read/write every
-- athlete's plan. Gone now: coach access is role-based only.
drop policy if exists "Coaches can manage all plans" on coach_plans;
create policy "Coaches can manage all plans"
  on coach_plans for all using (public.is_coach()) with check (public.is_coach());

-- ── 5. strava_tokens ─────────────────────────────────────────────────────────
drop policy if exists "Coaches read strava tokens" on strava_tokens;
create policy "Coaches read strava tokens"
  on strava_tokens for select using (public.is_coach());

-- ── 6. monthly_summaries ─────────────────────────────────────────────────────
drop policy if exists "Coach can read all summaries" on monthly_summaries;
drop policy if exists "Coach can write summaries"    on monthly_summaries;
create policy "Coach can read all summaries"
  on monthly_summaries for select using (public.is_coach());
create policy "Coach can write summaries"
  on monthly_summaries for all using (public.is_coach()) with check (public.is_coach());

-- ── 7. profiles: self-service writes + role-escalation guard ──────────────────
-- The app creates a profile row on first login and edits profiles client-side
-- (athlete edits own; coach edits any athlete). Allow those writes, but the
-- trigger below makes role changes coach-only.
drop policy if exists "Users insert own profile" on profiles;
create policy "Users insert own profile"
  on profiles for insert
  with check (email = (auth.jwt() ->> 'email') or public.is_coach());

drop policy if exists "Users update own profile" on profiles;
create policy "Users update own profile"
  on profiles for update
  using  (email = (auth.jwt() ->> 'email') or public.is_coach())
  with check (email = (auth.jwt() ->> 'email') or public.is_coach());

-- Role guard. Fires for every INSERT/UPDATE. Requests with no end-user JWT
-- (service role, SQL editor, dashboard, edge functions) are trusted and pass
-- through; a logged-in athlete cannot insert or update a row to a non-athlete
-- role unless they are already a coach.
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
    return NEW;  -- trusted backend (no end-user JWT)
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

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before insert or update on profiles
  for each row execute function public.guard_profile_role();

-- ── 8. calendar_markers (race / sick / taper / travel / note ribbons) ─────────
create table if not exists calendar_markers (
  id               uuid default gen_random_uuid() primary key,
  athlete_email    text not null,
  kind             text not null,
  marker_date      date not null,
  end_date         date,
  label            text,
  is_a_race        boolean default false,
  created_by_email text,
  created_at       timestamptz default now()
);
alter table calendar_markers add column if not exists is_a_race        boolean default false;
alter table calendar_markers add column if not exists created_by_email text;

alter table calendar_markers enable row level security;
drop policy if exists "Athletes manage own markers" on calendar_markers;
create policy "Athletes manage own markers"
  on calendar_markers for all
  using  (athlete_email = (auth.jwt() ->> 'email'))
  with check (athlete_email = (auth.jwt() ->> 'email'));
drop policy if exists "Coaches manage all markers" on calendar_markers;
create policy "Coaches manage all markers"
  on calendar_markers for all
  using (public.is_coach()) with check (public.is_coach());

-- ── 9. workout_templates (coach-owned saved workouts) ─────────────────────────
create table if not exists workout_templates (
  id          uuid default gen_random_uuid() primary key,
  coach_email text not null,
  name        text,
  type        text,
  tag         text,
  description text,
  pace        text,
  terrain     text,
  steps       jsonb,
  exercises   jsonb,
  created_at  timestamptz default now()
);
alter table workout_templates add column if not exists exercises jsonb;

alter table workout_templates enable row level security;
drop policy if exists "Coaches manage own templates" on workout_templates;
create policy "Coaches manage own templates"
  on workout_templates for all
  using  (public.is_coach() and coach_email = (auth.jwt() ->> 'email'))
  with check (public.is_coach() and coach_email = (auth.jwt() ->> 'email'));

-- ── 10. push_subscriptions (Web Push endpoints, one per device) ───────────────
create table if not exists push_subscriptions (
  id           uuid default gen_random_uuid() primary key,
  user_email   text not null,
  endpoint     text not null,
  p256dh       text,
  auth         text,
  device_label text,
  last_seen_at timestamptz default now()
);
-- Upsert in lib/push.js conflicts on endpoint, so endpoint must be unique.
create unique index if not exists push_subscriptions_endpoint_key
  on push_subscriptions (endpoint);

alter table push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on push_subscriptions;
create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using  (user_email = (auth.jwt() ->> 'email'))
  with check (user_email = (auth.jwt() ->> 'email'));
-- Note: the push-send edge function reads subscriptions with the service-role
-- key, which bypasses RLS — so coaches don't need a client-side read policy.

-- ── 11. Indexes for roster-scoped + windowed client queries ───────────────────
create index if not exists activities_email_date_idx
  on activities (athlete_email, activity_date desc);
create index if not exists session_logs_email_idx
  on session_logs (athlete_email);
create index if not exists monthly_summaries_email_idx
  on monthly_summaries (athlete_email);
