# Form & Pace

A run coaching platform. Athletes log session feedback and wellness data, coaches build plans and reply, and the app tracks training load, compliance, and performance over time.

---

## What's inside

### Athlete experience

**Today**
- Shows today's planned session at the top, or a rest/recovery prompt
- Goal-race countdown ribbon when a race marker is set
- Quick wellness check-in (RPE, sleep hours, soreness, mood) — submitted without opening a session
- Strava import banner when an unlinked activity matches the current week

**Session logging**
- Open any planned session to log it against its target
- Attach a Strava activity — fetches full split and lap data
- Manual fallback (distance + duration) when Strava isn't connected or the run isn't there yet
- Wellness fields per session: RPE 1–10, sleep hours, soreness 1–5, mood 1–5
- Analysis saved immediately; coach sees it in real time via Supabase Realtime
- Future sessions are read-only by default; athletes can unlock early logging

**Week view**
- Mon–Sun grid with each session as a card
- Drag a session card to a different day to reschedule (dnd-kit, pointer + touch sensors)
- Missed sessions highlighted in red; completed sessions tinted by workout type
- Extra (unplanned) Strava activities shown as separate cards

**Calendar (month view)**
- Full month grid with day-level compliance dots
- Race / sick / taper / travel / note ribbons overlaid on matching days
- Athletes can create their own markers

**Load tab (PMC)**
- Performance Management Chart: CTL (fitness), ATL (fatigue), TSB (form)
- Driven from Strava activity list (up to 180 days) plus manually logged runs
- Planned future sessions overlaid as a forecast when threshold pace is set
- Z1–Z5 zone bar on each logged run (from Strava split data or average pace fallback)

**Profile**
- Name, avatar initials
- Threshold pace (manual override or estimated from PBs)
- PBs and goals: 5K, 10K, Half Marathon, Full Marathon, free-text Other
- Race predictor: fills in estimated times for unset distances using Riegel's formula

**Strava integration**
- OAuth connect / disconnect from the profile screen
- Activities fetched (last 180 days, all sport types)
- Runs auto-synced to the `activities` table via a Supabase edge function
- Split and lap data fetched on demand when linking to a session

**Push notifications**
- VAPID Web Push via a registered service worker (`/public/sw.js`)
- Coaches can send push notifications to athletes when replying
- Athletes opt in from the profile screen; device label stored per subscription

---

### Coach experience

**Dashboard**
- Roster cards: athlete name, goal, weekly km, compliance rate, last session
- Tap a card to open that athlete's full detail view
- Filter bar (all / needs reply / recent activity)

**Reply Inbox**
- All sessions across all athletes that have athlete feedback and no coach reply yet
- Click any item to open the message thread inline

**Athlete detail (Plan / Logs / Messages / Profile tabs)**

*Plan tab*
- Week-by-week session grid, same drag-and-drop rescheduling as athlete view
- Coach day notes — inline freeform text per day, shown to the athlete
- "+ ADD WORKOUT" button on each day; session type, distance, duration, pace, structured steps
- Structured workout builder: warmup, steady, interval, strides, cooldown, recovery blocks
  - Intervals: reps × work distance/duration + recovery distance/duration + rest style (float/jog)
  - Strides: reps × stride seconds + rest seconds
  - Steady: can be km or min with optional repeats and rest
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
- Edit athlete name, avatar, threshold pace, PBs and goals on behalf of the athlete
- Changes reflected immediately in the roster

**Plan Builder**
- Full-screen plan editor: add / edit / delete / reorder weeks
- Excel import — paste a spreadsheet exported from Excel or Google Sheets; sessions are parsed from date, run description, terrain, pace, and km rows
- Bulk operations: duplicate week, clear week, shift all dates
- Workout Template Library integration — search and apply seeds to any session

**Workout Template Library**
- Curated seed workouts: Easy, Long, Tempo, Speed (intervals), Recovery, Strength, Hyrox, Race Day
- Zone-token paces (E / M / T / I / R) that expand to concrete ranges against the athlete's threshold pace
- Expandable to custom templates; coaches can save their own

**Annual Training Plan (Season View)**
- N-week forward view across all athletes
- Shows planned weekly km, rTSS, and compliance for the season arc
- Highlights peak load weeks and taper blocks

**Compliance Report**
- Summary table across all athletes: sessions planned, completed, missed, partial
- Filter by recent N weeks
- Click a cell to jump to that athlete's logs

**Per-athlete Calendar**
- Full month grid for the selected athlete
- Coaches can add/delete markers: race, sick, taper, travel, note
- Is-a-race flag on race markers; label field for race name or custom note

---

## Training load maths

All load calculations are in `lib/load.js` — pure functions, no React, no Supabase.

| Metric | Formula |
|--------|---------|
| rTSS | `(duration_h) × IF² × 100` where `IF = threshold_pace / run_pace` |
| CTL (fitness) | 42-day exponential moving average of daily rTSS |
| ATL (fatigue) | 7-day exponential moving average of daily rTSS |
| TSB (form) | `CTL − ATL` |

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

**Auto-classify run type** (for unplanned Strava imports): distance/duration → LONG; split variance + Z5 presence → SPEED; Z4 time > 20% → TEMPO; very slow average → RECOVERY; else EASY.

**Compliance grading** for a logged session vs its plan: within ±20% → completed; within ±50% → partial; < 50% of plan → missed. rTSS is preferred over distance over duration as the comparison axis.

**Race predictor** uses Riegel's endurance formula (`T2 = T1 × (D2/D1)^1.06`, k = 1.07 for marathon from shorter distances) to predict missing PBs from the fastest reference.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18 + Vite |
| Styling | Inline styles via `styles.js` (no CSS framework) |
| Drag-and-drop | @dnd-kit/core (pointer + touch sensors) |
| Database & auth | Supabase (PostgreSQL, RLS, Realtime) |
| Strava API | OAuth + activity list + activity detail via Supabase edge functions |
| Push notifications | Web Push API (VAPID) + service worker |
| Excel import | xlsx (SheetJS) |
| Hosting | Vercel (Vite auto-detected) |

---

## Database tables

Run the SQL files in order against your Supabase project:

| File | Table(s) created |
|------|-----------------|
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

A `calendar_markers` table is also required (race / sick / taper / travel ribbons). Create it via the SQL Editor if not already present — see the marker setup section in the Supabase SQL files.

A `push_subscriptions` table is required for Web Push — columns: `user_email`, `endpoint`, `p256dh`, `auth`, `device_label`, `last_seen_at`.

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

### Step 5 — Add an athlete

Athletes are added by having them log in with Google — their profile is created automatically on first login. The coach then creates a plan for them via the Plan Builder. There is no manual email list to maintain.

---

## Day-to-day usage

**Athlete**
1. Open the app on their phone → Continue with Google
2. Their weekly program appears immediately
3. Tap a session card → log feedback, attach Strava, submit wellness
4. Optional: Add to Home Screen (Safari/Chrome) for a native-app feel

**Coach**
1. Same URL, same Google login → automatically lands on the coach dashboard
2. Reply Inbox → review sessions awaiting a reply
3. Athlete card → Plan tab to build/edit the week; drag to reschedule
4. Logs tab to review split data and compliance; Messages tab for the full thread
5. Plan Builder → import an Excel spreadsheet to seed a multi-week block
6. Template Library → apply structured workout seeds with zone-relative pacing
7. Season View (ATP) → check the load arc across all athletes before the next block

---

## Optional: Strava backfill

Coaches can trigger a 365-day Strava backfill for any connected athlete from their detail view. This warms up the PMC with historical data so CTL/ATL/TSB lines start from a realistic baseline rather than zero.

---

## Optional: Custom domain

Vercel → your project → Settings → Domains → add something like `coaching.yourname.com`.
