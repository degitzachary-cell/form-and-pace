# Form & Pace

A run coaching platform. Athletes log session feedback and wellness data, coaches build plans and reply, and the app tracks training load, readiness, compliance, and performance over time. Strava activities sync automatically — both client-side and via a scheduled server-side job — and link themselves to the prescribed session for the day.

---

## What's inside

### Athlete experience

**Today**
- Today's planned session at the top, with predicted volume (≈ km derived from duration × pace when the coach set time but no distance), pace, and target RPE
- **Day navigation** — gutter chevrons (‹ ›), left/right swipe, and keyboard arrow keys scrub through the week without leaving the screen. Smart labels: TODAY / YESTERDAY / TOMORROW / "MON · MAY 5 · 3 DAYS AHEAD"
- **Readiness verdict** — a single quorum-gated card combining ACWR, Hooper wellness deviation, and easy-run effort drift. Shows "all clear", "train with care", or "back off" only when ≥2 signals agree (no single-signal noise)
- **Same-day doubles** — when two sessions fall on one day (e.g. AM easy + PM strength), a "DOUBLE TODAY" switcher routes the right activity to each via the session matcher
- Goal-race countdown ribbon when a race marker is set
- Quick wellness check-in (RPE, sleep hours, soreness, mood) — submitted without opening a session; RPE buttons colour-scaled blue→red by intensity
- First-run onboarding card (set threshold pace · connect Strava · wait for plan) when the athlete has no plan yet
- Strava import prompt when an unlinked activity matches today

**Session logging**
- Open any planned session to log it against its target
- Attach a Strava activity — fetches full split and lap data; the activity's real `start_date_local` is used, not the day it was imported
- Manual fallback (distance + duration) when Strava isn't connected or the run isn't there yet
- Wellness fields per session: RPE 1–10, sleep hours, soreness 1–5, mood 1–5
- Effort-drift tag ("felt harder/easier than target") comparing logged RPE to the session's prescribed RPE band
- Analysis saved immediately; coach sees it in real time via Supabase Realtime
- Future sessions are read-only by default; athletes can unlock early logging

**Week view**
- Mon–Sun grid with each session as a card
- Drag a session card to a different day to reschedule (dnd-kit, pointer + touch sensors)
- Per-day session↔activity matching (any source) so auto-synced Strava runs mark the prescribed session done — not just manually-logged ones
- Missed sessions highlighted in red; completed sessions tinted by workout type
- Extra (unplanned) activities shown as separate cards, de-duplicated against matched runs

**Calendar (month view)**
- Full month grid with day-level compliance dots
- Race / sick / taper / travel / note ribbons overlaid on matching days
- Athletes can create their own markers

**Load tab (PMC)**
- Performance Management Chart: CTL (fitness), ATL (fatigue), TSB (form)
- Memoised per-athlete so the heavy daily-rTSS → densify → compute pipeline doesn't rerun every render
- Driven from Strava activity list (up to 180 days) plus manually logged runs; sRPE fills in load for non-run sessions (strength, hyrox) that can't produce a pace-based rTSS
- Planned future sessions overlaid as a forecast when threshold pace is set
- Explicit empty state ("set your threshold pace to unlock the curve") instead of a misleading flat-zero line
- Z1–Z5 zone bar on each logged run (from Strava split data or average pace fallback)

**Profile**
- Name, avatar initials
- Threshold pace (masked min:ss input — can't be broken by typos; estimated from PBs if blank)
- **Pace unit** preference (min/km or min/mi) — converts every displayed pace and distance; all maths stays in km internally
- PBs and goals: 5K, 10K, Half Marathon, Full Marathon, free-text Other
- Race predictor: fills in estimated times for unset distances using Riegel's formula

**Strava integration**
- OAuth connect from the profile screen
- Activities fetched (last 180 days, all sport types)
- **Three sync paths:** (1) client-side auto-sync when the athlete opens the app, (2) coach-triggered 365-day backfill, (3) a scheduled server-side cron job (every 3h) that refreshes tokens and pulls runs for *all* athletes whether or not anyone opened the app
- Split and lap data fetched on demand when linking to a session
- Race-safe: a unique index on (athlete, strava id) + upsert-ignore-duplicates prevents concurrent syncs creating duplicate rows; same-day doubles are preserved

**Push notifications**
- VAPID Web Push via a registered service worker (`/public/sw.js`)
- Coaches can send push notifications to athletes when replying
- Athletes opt in from the profile screen; device label stored per subscription

---

### Coach experience

**Dashboard**
- Roster cards: athlete name, goal, weekly km, compliance rate, last session
- Desktop mini week-grid with per-day session↔activity matching
- "Sync All" — server backfill across the whole roster
- Tap a card to open that athlete's full detail view

**Reply Inbox**
- All sessions across all athletes that have athlete feedback and no coach reply yet
- Click any item to open the message thread inline

**Athlete detail (Plan / Logs / Messages / Profile tabs)**

*Plan tab*
- Week-by-week session grid, same drag-and-drop rescheduling as athlete view, with a grip handle that fades up on hover
- Per-day matching so auto-synced runs grade the prescribed session (the source of an earlier "everything shows missed" bug, now fixed everywhere)
- Coach day notes — inline freeform text per day, shown to the athlete
- "+ ADD WORKOUT" button on each day; session type, distance, duration, pace, target RPE, time-of-day, structured steps
- Structured workout builder: warmup, steady, interval, strides, cooldown, recovery blocks
  - Intervals: reps × work distance/duration + recovery distance/duration + rest style (float/jog/rest)
  - Strides: reps × stride seconds + rest seconds
  - Steady: km or min with optional repeats and rest
  - All pace fields support a min/km range (e.g. `5:10-5:30`)

*Logs tab*
- Scrollable session-by-session log history for the athlete
- Planned vs actual card: distance, duration, rTSS, compliance band
- Time-in-zone bar from Strava split data

*Messages tab*
- Full thread view per session or activity
- Coach reply with letterhead modal (formatted reply preview before sending)
- Unread badges on sessions with unread athlete messages

*Profile tab*
- Edit athlete name, avatar, threshold pace, pace unit, PBs and goals on behalf of the athlete
- Changes reflected immediately in the roster

**Plan Builder**
- Full-screen plan editor: add / edit / delete weeks
- **Past weeks collapse** by default (label + date + session count); current and future weeks stay expanded
- **"The Score"** forward-looking grid — only upcoming weeks, with predicted km per session/day (includes warm-up/cool-down for tempo/speed/hyrox, and the uncovered tail of a long run)
- **Per-athlete default week** — save a week's shape as the athlete's template; new weeks pre-stamp from it, then edit the fine details
- **Duplicate week** lands on the next *unfilled* Monday, not blindly +7
- Week-level lookups keyed by `weekStart` (robust to legacy rows with missing ids)
- Excel import — tucked behind an "Advanced" disclosure; parses sessions from date, run description, terrain, pace, and km rows. `exercises` round-trip correctly through saved templates
- Workout Template Library integration — search and apply seeds to any session

**Workout Template Library**
- Curated seed workouts: Easy, Long, Tempo, Speed (intervals), Recovery, Strength, Hyrox, Race Day
- Zone-token paces (E / M / T / I / R) that expand to concrete ranges against the athlete's threshold pace
- Expandable to custom templates; coaches can save their own (steps + exercises both persisted)

**Annual Training Plan (Season View)**
- N-week forward view across all athletes
- Shows planned weekly km, rTSS, and compliance for the season arc
- Highlights peak load weeks and taper blocks

**Compliance Report**
- Summary table across all athletes: sessions planned, completed, missed, partial
- Per-day matched (handles double days correctly, not last-write-wins by date)
- Filter by recent N weeks
- Click a cell to jump to that athlete's logs

**Per-athlete Calendar**
- Full month grid for the selected athlete
- Coaches can add/delete markers: race, sick, taper, travel, note
- Is-a-race flag on race markers; label field for race name or custom note

---

## Wellness & readiness maths

Wellness inputs (sleep, RPE, soreness, mood) feed four composable signals in `lib/wellness.js` — pure functions, conflict-guarded so they don't double-count:

| Signal | What it does |
|--------|--------------|
| **sRPE** | Foster session-RPE (`RPE × duration_min`), calibrated per athlete into rTSS-equivalent units so non-run sessions (strength, hyrox, manual logs) still contribute to PMC |
| **Hooper index** | Daily wellness score (sleep + soreness + mood) measured as a z-score against the athlete's own 28-day rolling baseline — not absolute thresholds |
| **Effort drift** | Logged RPE vs the prescribed `rpe_target` band; surfaces easy runs creeping hot as a fatigue early-warning |
| **Readiness verdict** | Combines ACWR (acute:chronic load), Hooper z-score, and recent easy-run drift into one verdict. Quorum-gated: needs ≥2 confident signals before recommending a change |

---

## Training load maths

All load calculations are in `lib/load.js` — pure functions, no React, no Supabase.

| Metric | Formula |
|--------|---------|
| rTSS | `(duration_h) × IF² × 100` where `IF = threshold_pace / run_pace` |
| sRPE | `RPE × duration_min` (Foster), scaled to rTSS-equivalent for non-run sessions |
| CTL (fitness) | 42-day exponential moving average of daily load |
| ATL (fatigue) | 7-day exponential moving average of daily load |
| TSB (form) | `CTL − ATL` |
| ACWR | `ATL / CTL` — Gabbett acute:chronic ratio; 0.8–1.3 sweet spot |

**Threshold pace** is the athlete's lactate-threshold pace (min/km). Set explicitly in their profile, or estimated from PBs using Daniels offsets:
- 5K PB + 18 s/km
- 10K PB + 8 s/km
- HM PB − 2 s/km *(preferred)*
- FM PB − 12 s/km

**Pace zones** (Z1–Z5) are threshold-relative multipliers:

| Zone | Name | Range |
|------|------|-------|
| Z1 | Recovery | > 1.30× threshold |
| Z2 | Easy | 1.15–1.30× |
| Z3 | Steady | 1.05–1.15× |
| Z4 | Threshold | 0.97–1.05× |
| Z5 | VO₂ | < 0.97× |

**RPE colour scale** — 1–2 blue (recovery) · 3–4 green (easy) · 5–6 amber (steady) · 7–8 orange (tempo) · 9–10 red (race/VO₂). Applied wherever an RPE number is shown.

**Volume prediction** — when a session has duration + pace but no explicit distance, distance ≈ duration ÷ pace. Structured workouts aggregate their steps, predict the uncovered tail of the run at the top-level pace, and assume a 15-min warm-up + cool-down for tempo/speed/hyrox when no explicit blocks exist. Predicted figures are marked with ≈.

**Auto-classify run type** (for unplanned Strava imports): distance/duration → LONG; split variance + Z5 presence → SPEED; Z4 time > 20% → TEMPO; very slow average → RECOVERY; else EASY.

**Compliance grading** for a logged session vs its plan: within ±20% → completed; within ±50% → partial; < 50% of plan → missed. rTSS is preferred over distance over duration as the comparison axis.

**Race predictor** uses Riegel's endurance formula (`T2 = T1 × (D2/D1)^1.06`, k = 1.07 for marathon from shorter distances) to predict missing PBs from the fastest reference.

---

## Session ↔ activity matching

`lib/sessionMatching.js` is the single source of truth for linking a logged activity to its prescribed session. It scores every (session, activity) pair by sport-type match, time-of-day, distance proximity, and duration proximity, then greedy-assigns highest-scoring pairs first. It counts **all** activity sources (`strava-auto`, `strava`, `manual`, `session`) — critical because athletes whose runs auto-sync never create a `source="session"` row. Used by the athlete Today/Week/History views and every coach grid (drilldown, dashboard, compliance).

---

## Date handling

All dates are `YYYY-MM-DD` strings meaning "this calendar day in the athlete's local timezone". `parseLocalDate()` in `lib/helpers.js` is the canonical parser (appends `T00:00:00`, never UTC). Week-bucketing compares date strings directly to avoid the UTC-midnight trap that could push a Sunday run into the prior week west of GMT.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite |
| Styling | Inline styles via `styles.js` (no CSS framework) |
| Drag-and-drop | @dnd-kit/core (pointer + touch sensors) |
| Database & auth | Supabase (PostgreSQL, RLS, Realtime) |
| Strava API | OAuth + activity list + detail + scheduled sync via Supabase edge functions |
| Scheduled jobs | pg_cron + pg_net (server-side Strava sync every 3h) |
| Push notifications | Web Push API (VAPID) + service worker |
| Excel import | xlsx (SheetJS) |
| Hosting | Vercel (Vite auto-detected) |

---

## Database tables & migrations

Run the SQL files in order against your Supabase project:

| File | What it does |
|------|--------------|
| `supabase-setup.sql` | `session_logs` |
| `supabase-profiles-setup.sql` | `profiles` |
| `supabase-activities-setup.sql` | `activities` |
| `supabase-coach-plans-setup.sql` | `coach_plans` |
| `supabase-strava-setup.sql` | `strava_tokens` |
| `supabase-monthly-summaries-setup.sql` | `monthly_summaries` |
| `supabase-load-migration.sql` | Adds load/rTSS columns to `activities` |
| `supabase-strava-data-migration.sql` | Adds `strava_data` JSONB to `activities` |
| `supabase-coach-notes-migration.sql` | Adds `day_notes` to `coach_plans` |
| `supabase-coach-rls-fix.sql` | Fixes coach RLS policies |
| `supabase-pace-unit-migration.sql` | Adds `pace_unit` (`km`/`mi`) to `profiles` |
| `supabase-workout-templates-exercises-migration.sql` | Adds `exercises` JSONB to `workout_templates` |
| `supabase-strava-dedupe-migration.sql` | Dedupes activities + adds the `strava_activity_id` generated column and unique index that makes sync race-safe |
| `supabase-realtime-publication-migration.sql` | Adds tables to the `supabase_realtime` publication so live updates fire |
| `supabase-strava-cron-sync-setup.sql` | Schedules the server-side Strava sync (every 3h) via pg_cron + pg_net |

A `calendar_markers` table is also required (race / sick / taper / travel ribbons). Create it via the SQL Editor if not already present — see the marker setup section in the Supabase SQL files.

A `push_subscriptions` table is required for Web Push — columns: `user_email`, `endpoint`, `p256dh`, `auth`, `device_label`, `last_seen_at`.

### Edge functions

| Function | Purpose | `verify_jwt` |
|----------|---------|--------------|
| `strava-auth` | OAuth code → token exchange on connect | on |
| `strava-activities` | Live activity list + detail fetch for the picker | on |
| `strava-sync-athlete` | Coach-triggered 365-day backfill for one athlete | on |
| `strava-cron-sync` | Scheduled all-athlete token refresh + run pull | **off** — self-guarded by a shared secret in the `x-cron-secret` header |
| `push-send` | Sends VAPID Web Push to an athlete | on |

> **`strava-cron-sync`** holds a `CRON_SECRET` constant in its source (server-side only, never in the client bundle). The pg_cron job passes the same value as the `x-cron-secret` header. Strava rotates refresh tokens on every refresh, so the function persists the new token each time — failing to do that breaks all future refreshes.

---

## Environment variables

| Variable | Where to get it |
|----------|----------------|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `VITE_VAPID_PUBLIC` | Generate with `web-push generate-vapid-keys` (optional — a default is baked in for development) |

Strava credentials (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`) live in Supabase Edge Function secrets, not in the frontend env.

---

## Deployment

### Step 1 — Supabase (~10 min)

1. **supabase.com** → New project → name it "form-and-pace" → set a DB password
2. Wait ~2 min for it to spin up
3. SQL Editor → New Query → paste and run each `.sql` file listed above in order
4. **Authentication → Providers → Google → toggle ON**
   - Go to console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorised redirect URI: `https://your-project-id.supabase.co/auth/v1/callback`
   - Copy Client ID + Secret back into Supabase
5. **Settings → API** → copy Project URL and anon key

### Step 2 — Set your coach email

In `lib/supabase.js` (or wherever `COACH_EMAILS` is defined), add your Gmail address:

```js
const COACH_EMAILS = ["your.actual.email@gmail.com"];
```

Update the RLS policy in `supabase-setup.sql` to match the same email before running it.

### Step 3 — Deploy to Vercel (~5 min)

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/form-and-pace.git
git push -u origin main
```

1. vercel.com → Add New Project → import your repo
2. Vercel auto-detects Vite/React
3. Environment Variables → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Deploy — ~60 seconds → live URL like `form-and-pace.vercel.app`

### Step 4 — Wire Supabase back to Vercel

- Supabase → Authentication → URL Configuration → add your Vercel URL to **Redirect URLs**
- Google Console → add your Vercel URL to **Authorised redirect URIs**

### Step 5 — Strava + scheduled sync

1. Create a Strava API application (strava.com/settings/api) and add `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` to **Supabase → Edge Functions → Secrets**
2. Deploy the edge functions (`supabase functions deploy <name>`). Deploy `strava-cron-sync` with `--no-verify-jwt`
3. Enable `pg_cron` and `pg_net` (Database → Extensions), then run `supabase-strava-cron-sync-setup.sql` — replace the `x-cron-secret` placeholder with the `CRON_SECRET` value from `strava-cron-sync/index.ts`
4. Run `supabase-realtime-publication-migration.sql` so live updates fire between coach and athlete

### Step 6 — Add an athlete

Athletes are added by having them log in with Google — their profile is created automatically on first login. The coach then creates a plan for them via the Plan Builder. There is no manual email list to maintain.

---

## Day-to-day usage

**Athlete**
1. Open the app on their phone → Continue with Google
2. Their weekly program appears immediately; chevron/swipe through days on Today
3. Tap a session card → log feedback, attach Strava, submit wellness — or just run; an auto-synced Strava run links itself to the day's session
4. Check the readiness card before a hard day
5. Optional: Add to Home Screen (Safari/Chrome) for a native-app feel

**Coach**
1. Same URL, same Google login → automatically lands on the coach dashboard
2. Reply Inbox → review sessions awaiting a reply (auto-synced runs already grade the prescribed session)
3. Athlete card → Plan tab to build/edit the week; drag to reschedule; "Save as default" to set the athlete's recurring week shape
4. Logs tab to review split data and compliance; Messages tab for the full thread
5. Plan Builder → add weeks (pre-stamped from the default), duplicate into the next free week, or import an Excel block from the Advanced panel
6. Template Library → apply structured workout seeds with zone-relative pacing
7. Season View (ATP) → check the load arc across all athletes before the next block

---

## Strava sync — how it actually works

Three independent paths keep the `activities` table fresh:

1. **Client auto-sync** — when an athlete opens the app, the last 180 days of their Strava activities are diffed against existing rows and new ones inserted (`source: "strava-auto"`).
2. **Coach backfill** — coaches trigger a 365-day pull for any connected athlete (or "Sync All" for the roster) from the dashboard. Warms up the PMC so CTL/ATL/TSB start from a realistic baseline.
3. **Scheduled cron** — `strava-cron-sync` runs every 3 hours, refreshes every athlete's access token, and pulls recent runs **regardless of whether anyone opened the app**. This closes the gap where an athlete who ran but didn't open Form & Pace (or whose token expired) left the coach with no data.

All three share the same race-safe upsert (unique index on `athlete_email` + `strava_activity_id`) and the same dedupe rule: an incoming Strava run is only suppressed against an *untagged* manual/session row that might be the same run (consume-once), so genuine same-day doubles always survive.

> If an athlete's runs stop syncing, the usual cause is a **revoked Strava refresh token** — they need to reconnect Strava from the profile screen. Token validity is visible in the `strava_tokens` table (`expires_at`).

---

## Optional: Custom domain

Vercel → your project → Settings → Domains → add something like `coaching.yourname.com`.
