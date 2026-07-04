-- ─────────────────────────────────────────────────────────────────────────────
-- PERFORMANCE: wrap per-row auth calls in (select …) initplans
--
-- The Supabase performance advisor (auth_rls_initplan) flags policies that
-- call auth.jwt() / is_coach() directly: Postgres re-evaluates them for EVERY
-- candidate row. Wrapping in a scalar subquery turns them into an InitPlan —
-- evaluated once per statement. Semantics are identical.
--
-- Row-dependent predicates (is_coach_of(athlete_email), is_my_coach(email))
-- necessarily run per row and stay as-is — they are indexed EXISTS lookups.
-- Run AFTER supabase-multicoach-migration.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- session_logs
drop policy if exists "session_logs_athlete_all" on public.session_logs;
create policy "session_logs_athlete_all" on public.session_logs
  for all using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')))
          with check (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- activities
drop policy if exists "activities_athlete_all" on public.activities;
create policy "activities_athlete_all" on public.activities
  for all using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')))
          with check (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- coach_plans
drop policy if exists "coach_plans_athlete_select" on public.coach_plans;
create policy "coach_plans_athlete_select" on public.coach_plans
  for select using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- strava_tokens
drop policy if exists "strava_tokens_user_all" on public.strava_tokens;
create policy "strava_tokens_user_all" on public.strava_tokens
  for all using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')))
          with check (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- monthly_summaries
drop policy if exists "monthly_summaries_athlete_select" on public.monthly_summaries;
create policy "monthly_summaries_athlete_select" on public.monthly_summaries
  for select using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- calendar_markers
drop policy if exists "calendar_markers_athlete_all" on public.calendar_markers;
create policy "calendar_markers_athlete_all" on public.calendar_markers
  for all using (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')))
          with check (lower(athlete_email) = (select lower(auth.jwt() ->> 'email')));

-- workout_templates
drop policy if exists "workout_templates_coach_all" on public.workout_templates;
create policy "workout_templates_coach_all" on public.workout_templates
  for all using ((select public.is_coach()) and lower(coach_email) = (select lower(auth.jwt() ->> 'email')))
          with check ((select public.is_coach()) and lower(coach_email) = (select lower(auth.jwt() ->> 'email')));

-- push_subscriptions
drop policy if exists "push_subscriptions_user_all" on public.push_subscriptions;
create policy "push_subscriptions_user_all" on public.push_subscriptions
  for all using (lower(user_email) = (select lower(auth.jwt() ->> 'email')))
          with check (lower(user_email) = (select lower(auth.jwt() ->> 'email')));

-- profiles (self parts wrapped; roster predicates stay per-row by nature)
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped" on public.profiles
  for select using (
    lower(email) = (select lower(auth.jwt() ->> 'email'))
    or public.is_coach_of(email, false)
    or public.is_my_coach(email)
  );
drop policy if exists "profiles_insert_self_or_coach" on public.profiles;
create policy "profiles_insert_self_or_coach" on public.profiles
  for insert with check (
    lower(email) = (select lower(auth.jwt() ->> 'email')) or public.is_coach_of(email, false)
  );
drop policy if exists "profiles_update_self_or_coach" on public.profiles;
create policy "profiles_update_self_or_coach" on public.profiles
  for update using (lower(email) = (select lower(auth.jwt() ->> 'email')) or public.is_coach_of(email))
            with check (lower(email) = (select lower(auth.jwt() ->> 'email')) or public.is_coach_of(email));

-- coach_athletes
drop policy if exists "coach_athletes_select_own" on public.coach_athletes;
create policy "coach_athletes_select_own" on public.coach_athletes
  for select using (
    coach_email = (select lower(auth.jwt() ->> 'email'))
    or athlete_email = (select lower(auth.jwt() ->> 'email'))
  );
drop policy if exists "coach_athletes_coach_invite" on public.coach_athletes;
create policy "coach_athletes_coach_invite" on public.coach_athletes
  for insert with check (
    (select public.is_coach()) and coach_email = (select lower(auth.jwt() ->> 'email')) and status = 'pending'
  );
drop policy if exists "coach_athletes_athlete_update" on public.coach_athletes;
create policy "coach_athletes_athlete_update" on public.coach_athletes
  for update using (athlete_email = (select lower(auth.jwt() ->> 'email')))
            with check (athlete_email = (select lower(auth.jwt() ->> 'email')));
drop policy if exists "coach_athletes_delete" on public.coach_athletes;
create policy "coach_athletes_delete" on public.coach_athletes
  for delete using (
    coach_email = (select lower(auth.jwt() ->> 'email'))
    or athlete_email = (select lower(auth.jwt() ->> 'email'))
  );
