-- ─────────────────────────────────────────────────────────────────────────────
-- CONSENT HARDENING: pending invites grant NOTHING
--
-- Audit finding: with open coach signup, any user can set role='coach' and
-- insert a pending coach_athletes row for ANY email. Two policies keyed off
-- is_coach_of(..., require_active := false), so a unilateral pending invite
-- was enough to:
--   1. read/overwrite/DELETE the victim's coach_plans row (it is unique per
--      athlete — the attacker edits the same row the real coach uses), and
--   2. read the victim's full profile (name, PBs, goals, threshold pace).
--
-- This migration requires an ACCEPTED (status='active') relationship for
-- both. Trade-off: a coach can no longer draft a plan, or see the athlete's
-- profile name, while the invite is still pending — the roster row itself
-- (email, PENDING badge) remains visible via coach_athletes_select_own.
--
-- Run AFTER supabase-perf-initplan-migration.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- coach_plans: active roster only (was: pending OR active)
drop policy if exists "coach_plans_coach_all" on public.coach_plans;
create policy "coach_plans_coach_all" on public.coach_plans
  for all using (public.is_coach_of(athlete_email))
          with check (public.is_coach_of(athlete_email));

-- profiles: reads require active roster membership (self + own-coach reads
-- unchanged)
drop policy if exists "profiles_select_scoped" on public.profiles;
create policy "profiles_select_scoped" on public.profiles
  for select using (
    lower(email) = (select lower(auth.jwt() ->> 'email'))
    or public.is_coach_of(email)
    or public.is_my_coach(email)
  );

-- profiles: coach-created athlete profiles also require active membership
-- (blocks pre-creating a profile row for someone who never accepted)
drop policy if exists "profiles_insert_self_or_coach" on public.profiles;
create policy "profiles_insert_self_or_coach" on public.profiles
  for insert with check (
    lower(email) = (select lower(auth.jwt() ->> 'email')) or public.is_coach_of(email)
  );
