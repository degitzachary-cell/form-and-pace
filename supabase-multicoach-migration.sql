-- ─────────────────────────────────────────────────────────────────────────────
-- MULTI-COACH / OPEN-SIGNUP MIGRATION
--
-- Run AFTER supabase-schema.sql (or an already-reconciled database).
-- Idempotent — safe to re-run.
--
-- What it does:
--   1. coach_athletes roster table — the consent primitive. A coach invites an
--      athlete by email (status='pending'); the athlete accepts in-app
--      (status='active'). Coaches can only read an athlete's private data
--      once the athlete has ACCEPTED. This is what makes open coach signup
--      safe: a brand-new coach sees nothing until someone consents.
--   2. is_coach_of() / is_my_coach() predicates (SECURITY DEFINER, like
--      is_coach()) used by the rewritten RLS policies.
--   3. Rewrites every "coach sees everything" policy to "coach sees their
--      ACTIVE roster" (plans allow pending too, so a coach can draft a plan
--      while the invite is outstanding — plans are coach-authored content,
--      not athlete-private data).
--   4. Relaxes the profile-role guard so a new user can choose Coach or
--      Athlete for THEIR OWN profile at signup (scoped RLS makes the coach
--      role grant nothing until an athlete accepts).
--   5. Backfills the existing roster: every athlete with a plan becomes an
--      ACTIVE member under both existing coach accounts, so nothing changes
--      for the current deployment.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Roster table ──────────────────────────────────────────────────────────
create table if not exists public.coach_athletes (
  id            uuid primary key default gen_random_uuid(),
  coach_email   text not null check (coach_email = lower(coach_email)),
  athlete_email text not null check (athlete_email = lower(athlete_email)),
  status        text not null default 'pending' check (status in ('pending','active')),
  created_at    timestamptz default now(),
  accepted_at   timestamptz,
  unique (coach_email, athlete_email)
);
create index if not exists coach_athletes_athlete_idx on public.coach_athletes (athlete_email);
create index if not exists coach_athletes_coach_idx   on public.coach_athletes (coach_email);

-- ── 2. Predicates ────────────────────────────────────────────────────────────
-- True when the caller is a coach AND `target` athlete is on their roster.
-- require_active=true (default) demands an accepted invite — used for all
-- athlete-private data. require_active=false also matches pending — used for
-- coach-authored content (plans, athlete profile enrichment).
create or replace function public.is_coach_of(target text, require_active boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_coach() and exists (
    select 1 from public.coach_athletes ca
    where ca.coach_email = lower(auth.jwt() ->> 'email')
      and ca.athlete_email = lower(target)
      and (not require_active or ca.status = 'active')
  );
$$;
revoke all on function public.is_coach_of(text, boolean) from public;
revoke all on function public.is_coach_of(text, boolean) from anon;
grant execute on function public.is_coach_of(text, boolean) to authenticated;

-- True when `target` is a coach who has invited (or coaches) the caller —
-- lets an athlete read their inviter's profile for the acceptance banner.
create or replace function public.is_my_coach(target text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coach_athletes ca
    where ca.athlete_email = lower(auth.jwt() ->> 'email')
      and ca.coach_email = lower(target)
  );
$$;
revoke all on function public.is_my_coach(text) from public;
revoke all on function public.is_my_coach(text) from anon;
grant execute on function public.is_my_coach(text) to authenticated;

-- ── 3. coach_athletes RLS ────────────────────────────────────────────────────
alter table public.coach_athletes enable row level security;

drop policy if exists "coach_athletes_select_own" on public.coach_athletes;
create policy "coach_athletes_select_own" on public.coach_athletes
  for select using (
    coach_email = lower(auth.jwt() ->> 'email') or athlete_email = lower(auth.jwt() ->> 'email')
  );

-- Coaches invite (pending ONLY — an active row requires the athlete's accept).
drop policy if exists "coach_athletes_coach_invite" on public.coach_athletes;
create policy "coach_athletes_coach_invite" on public.coach_athletes
  for insert with check (
    public.is_coach() and coach_email = lower(auth.jwt() ->> 'email') and status = 'pending'
  );

-- Athletes accept / manage their own membership rows.
drop policy if exists "coach_athletes_athlete_update" on public.coach_athletes;
create policy "coach_athletes_athlete_update" on public.coach_athletes
  for update using (athlete_email = lower(auth.jwt() ->> 'email'))
            with check (athlete_email = lower(auth.jwt() ->> 'email'));

-- Either side can end the relationship.
drop policy if exists "coach_athletes_delete" on public.coach_athletes;
create policy "coach_athletes_delete" on public.coach_athletes
  for delete using (
    coach_email = lower(auth.jwt() ->> 'email') or athlete_email = lower(auth.jwt() ->> 'email')
  );

-- ── 4. Rewrite coach policies: roster-scoped instead of see-everything ──────
-- session_logs (athlete-private → active roster only)
drop policy if exists "session_logs_coach_select" on public.session_logs;
create policy "session_logs_coach_select" on public.session_logs
  for select using (public.is_coach_of(athlete_email));
drop policy if exists "session_logs_coach_insert" on public.session_logs;
create policy "session_logs_coach_insert" on public.session_logs
  for insert with check (public.is_coach_of(athlete_email));
drop policy if exists "session_logs_coach_update" on public.session_logs;
create policy "session_logs_coach_update" on public.session_logs
  for update using (public.is_coach_of(athlete_email)) with check (public.is_coach_of(athlete_email));
drop policy if exists "session_logs_coach_delete" on public.session_logs;
create policy "session_logs_coach_delete" on public.session_logs
  for delete using (public.is_coach_of(athlete_email));

-- activities (athlete-private → active roster only)
drop policy if exists "activities_coach_select" on public.activities;
create policy "activities_coach_select" on public.activities
  for select using (public.is_coach_of(athlete_email));
drop policy if exists "activities_coach_update" on public.activities;
create policy "activities_coach_update" on public.activities
  for update using (public.is_coach_of(athlete_email)) with check (public.is_coach_of(athlete_email));
drop policy if exists "activities_coach_delete" on public.activities;
create policy "activities_coach_delete" on public.activities
  for delete using (public.is_coach_of(athlete_email));

-- coach_plans (coach-authored → pending OR active, so plans can be drafted
-- while an invite is outstanding)
drop policy if exists "coach_plans_coach_all" on public.coach_plans;
create policy "coach_plans_coach_all" on public.coach_plans
  for all using (public.is_coach_of(athlete_email, false))
          with check (public.is_coach_of(athlete_email, false));

-- strava_tokens (highly sensitive → active roster only)
drop policy if exists "strava_tokens_coach_select" on public.strava_tokens;
create policy "strava_tokens_coach_select" on public.strava_tokens
  for select using (public.is_coach_of(athlete_email));

-- monthly_summaries (active roster only)
drop policy if exists "monthly_summaries_coach_select" on public.monthly_summaries;
create policy "monthly_summaries_coach_select" on public.monthly_summaries
  for select using (public.is_coach_of(athlete_email));
drop policy if exists "monthly_summaries_coach_all" on public.monthly_summaries;
create policy "monthly_summaries_coach_all" on public.monthly_summaries
  for all using (public.is_coach_of(athlete_email))
          with check (public.is_coach_of(athlete_email));

-- calendar_markers (active roster only)
drop policy if exists "calendar_markers_coach_all" on public.calendar_markers;
create policy "calendar_markers_coach_all" on public.calendar_markers
  for all using (public.is_coach_of(athlete_email))
          with check (public.is_coach_of(athlete_email));

-- profiles: was "any authenticated user can read every profile" — with open
-- signup that leaks every user's name/email to everyone. Now: own profile,
-- your roster's profiles (incl. pending, for dashboard enrichment), and your
-- inviter/coach's profile (for the acceptance banner).
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped" on public.profiles
  for select using (
    lower(email) = lower(auth.jwt() ->> 'email')
    or public.is_coach_of(email, false)
    or public.is_my_coach(email)
  );

drop policy if exists "profiles_insert_self_or_coach" on public.profiles;
create policy "profiles_insert_self_or_coach" on public.profiles
  for insert with check (
    lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach_of(email, false)
  );
drop policy if exists "profiles_update_self_or_coach" on public.profiles;
create policy "profiles_update_self_or_coach" on public.profiles
  for update using (lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach_of(email))
            with check (lower(email) = lower(auth.jwt() ->> 'email') or public.is_coach_of(email));

-- ── 5. Role guard: allow self-service role choice at signup ─────────────────
-- Open signup means a user picks Coach or Athlete for THEIR OWN profile.
-- Roster-scoped RLS makes the coach role harmless until an athlete accepts,
-- so self-selection (insert or update, own row only) is safe. Editing anyone
-- ELSE's role still requires being a coach of that athlete.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text := lower(auth.jwt() ->> 'email');
begin
  if caller_email is null then
    return NEW;  -- trusted backend (no end-user JWT)
  end if;
  if NEW.role is not null and NEW.role not in ('athlete', 'coach') then
    raise exception 'Invalid role %', NEW.role;
  end if;
  if lower(NEW.email) = caller_email then
    return NEW;  -- own profile: any valid role
  end if;
  if TG_OP = 'INSERT' then
    if coalesce(NEW.role, 'athlete') <> 'athlete' and not public.is_coach() then
      raise exception 'Only a coach may create a non-athlete profile';
    end if;
  elsif TG_OP = 'UPDATE' then
    if NEW.role is distinct from OLD.role and not public.is_coach() then
      raise exception 'Only a coach may change another profile''s role';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_profile_role() from public;
revoke all on function public.guard_profile_role() from anon;
revoke all on function public.guard_profile_role() from authenticated;

-- ── 6. Backfill: current roster stays intact for both existing coaches ──────
insert into public.coach_athletes (coach_email, athlete_email, status, accepted_at)
select c.email, p.athlete_email, 'active', now()
from (values ('degitzachary@gmail.com'), ('z.degit@gmail.com')) as c(email)
cross join (select distinct lower(athlete_email) as athlete_email from public.coach_plans) p
where c.email <> p.athlete_email
on conflict (coach_email, athlete_email) do nothing;

-- ── 7. Realtime (optional but nice): invite acceptance shows up live ────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coach_athletes'
  ) then
    execute 'alter publication supabase_realtime add table public.coach_athletes';
  end if;
end $$;
