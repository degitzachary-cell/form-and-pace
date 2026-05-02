// Match activities to planned sessions when there's more than one of each
// on the same day (e.g. AM easy run + PM strength, or doubles).
//
// The naive pattern used elsewhere in the app — `actsByDate.get(date)` —
// returns the first activity for the date and silently links it to every
// session that day. With doubles that breaks: both sessions display the
// same activity, both compliance grades use the same numbers.
//
// This module is the single source of truth for "which activity belongs
// to which session". Pure functions — no React, no Supabase.
//
// Algorithm:
//   1. Honour explicit links first. If a session_log carries an
//      analysis.linked_activity_id (manual pick from the Strava picker),
//      or an activity has source="session" pointing back to a session id,
//      that pairing is locked and removed from the candidate pool.
//   2. Score every remaining (session, activity) pair.
//   3. Greedy-assign highest-scoring pairs first.
//
// Scoring weights are tuned so sport-type match dominates, time-of-day
// is the next tiebreaker, then distance proximity, then duration. Each
// signal can be missing (returns 0), so the matcher degrades cleanly
// when the coach hasn't filled in time_of_day or planned distance.

const SCORE = {
  SPORT_MATCH:    100,   // strength↔strength, run↔run
  SPORT_MISMATCH: -100,  // run session paired with a strength activity is almost certainly wrong
  TIME_MATCH:      30,   // AM session + AM activity
  TIME_MISMATCH:  -20,
  DISTANCE_MAX:    40,   // ×ratio, so 0..40
  DURATION_MAX:    20,
};

const RUN_TYPES = new Set([
  "run", "easy", "easy run", "long", "long run", "tempo", "speed",
  "recovery", "trail run", "race", "race day", "virtualrun",
]);
const STRENGTH_TYPES = new Set([
  "strength", "weighttraining", "workout", "crossfit",
]);

// Normalise an activity_type or session.type to one of:
//   "run" | "strength" | "other"
function classifySport(rawType) {
  if (!rawType) return "run";  // legacy default — most rows are runs
  const k = String(rawType).toLowerCase().trim();
  if (RUN_TYPES.has(k)) return "run";
  if (STRENGTH_TYPES.has(k)) return "strength";
  // Strava sport_type variants: "Run", "TrailRun", "VirtualRun"
  if (k.includes("run")) return "run";
  if (k.includes("strength") || k.includes("weight")) return "strength";
  return "other";
}

// Pull the local-time hour-of-day from an activity. Activities table
// stores activity_date (YYYY-MM-DD) without time, but strava_data carries
// start_date_local. Returns null if we can't tell.
function activityHour(activity) {
  if (!activity) return null;
  const iso = activity.strava_data?.start_date_local
           || activity.start_date_local
           || null;
  if (!iso) return null;
  const t = iso.split("T")[1];
  if (!t) return null;
  const hh = parseInt(t.slice(0, 2), 10);
  return Number.isFinite(hh) ? hh : null;
}

// Resolve a session.time_of_day field into a target hour or "AM"/"PM"
// bucket. Accepts "AM", "PM", or "HH:MM" / "H:MM". Returns null if
// nothing meaningful.
function sessionTimeBucket(timeOfDay) {
  if (!timeOfDay) return null;
  const t = String(timeOfDay).trim().toUpperCase();
  if (t === "AM" || t === "PM") return t;
  // HH:MM
  const m = t.match(/^(\d{1,2}):?(\d{2})?$/);
  if (m) {
    const h = parseInt(m[1], 10);
    if (Number.isFinite(h)) return h < 12 ? "AM" : "PM";
  }
  return null;
}

function timeMatchScore(session, activity) {
  const target = sessionTimeBucket(session?.time_of_day);
  if (!target) return 0;
  const hh = activityHour(activity);
  if (hh == null) return 0;
  const actBucket = hh < 12 ? "AM" : "PM";
  return actBucket === target ? SCORE.TIME_MATCH : SCORE.TIME_MISMATCH;
}

function proximity(planned, actual) {
  if (!planned || !actual) return 0;
  const ratio = 1 - Math.abs(actual - planned) / planned;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

// Score one (session, activity) pair. Higher = better match.
export function pairScore(session, activity) {
  if (!session || !activity) return -Infinity;

  let score = 0;

  // 1. Sport match dominates.
  const sSport = classifySport(session.type);
  const aSport = classifySport(activity.activity_type);
  if (sSport === aSport) score += SCORE.SPORT_MATCH;
  else if (sSport === "other" || aSport === "other") score += 0;
  else score += SCORE.SPORT_MISMATCH;

  // 2. Time-of-day, when available on both sides.
  score += timeMatchScore(session, activity);

  // 3. Distance proximity.
  const plannedKm = session.distance_km || session.distance || null;
  const actualKm = parseFloat(activity.distance_km) || null;
  score += proximity(plannedKm, actualKm) * SCORE.DISTANCE_MAX;

  // 4. Duration proximity.
  const plannedMin = session.duration_min || session.duration || null;
  const actualMin = activity.duration_seconds ? activity.duration_seconds / 60 : null;
  score += proximity(plannedMin, actualMin) * SCORE.DURATION_MAX;

  return score;
}

// Match a set of sessions on a given date to a set of activities on
// the same date.
//
// Inputs:
//   sessions   — array of session objects (must have stable .id)
//   activities — array of activity objects (must have stable .id)
//   logs       — map keyed by session_id → log row, used to honour
//                explicit manual links (analysis.linked_activity_id)
//
// Returns:
//   {
//     bySessionId:   Map<sessionId, activity | null>,
//     byActivityId:  Map<activityId, session | null>,
//     unmatchedActs: activity[],  // activities with no session — extras
//   }
export function matchActivitiesToSessions({ sessions, activities, logs }) {
  const bySessionId = new Map();
  const byActivityId = new Map();
  const sessionPool = [...(sessions || [])];
  const activityPool = [...(activities || [])];

  // 1. Lock explicit links.
  for (const session of sessionPool) {
    bySessionId.set(session.id, null);
    const log = logs?.[session.id];
    const explicitId = log?.analysis?.linked_activity_id;
    if (!explicitId) continue;
    const idx = activityPool.findIndex(a => a.id === explicitId);
    if (idx === -1) continue;
    const act = activityPool[idx];
    bySessionId.set(session.id, act);
    byActivityId.set(act.id, session);
    activityPool.splice(idx, 1);
  }
  // Activities created from a session log carry source="session" + the
  // session id is recoverable via matching log. Honour those too.
  for (let i = activityPool.length - 1; i >= 0; i--) {
    const act = activityPool[i];
    if (act.source !== "session") continue;
    const matchingLog = Object.values(logs || {}).find(l =>
      l?.analysis?.actual_date === act.activity_date
      && l?.analysis?.distance_km && parseFloat(act.distance_km)
      && Math.abs(l.analysis.distance_km - parseFloat(act.distance_km)) < 0.05
    );
    if (!matchingLog) continue;
    const session = sessionPool.find(s => s.id === matchingLog.session_id);
    if (!session || bySessionId.get(session.id)) continue;
    bySessionId.set(session.id, act);
    byActivityId.set(act.id, session);
    activityPool.splice(i, 1);
  }

  // 2. Score remaining pairs.
  const unlinkedSessions = sessionPool.filter(s => !bySessionId.get(s.id));
  const pairs = [];
  for (const s of unlinkedSessions) {
    for (const a of activityPool) {
      const score = pairScore(s, a);
      if (score === -Infinity) continue;
      pairs.push({ session: s, activity: a, score });
    }
  }
  pairs.sort((p, q) => q.score - p.score);

  // 3. Greedy assignment. Negative-scoring pairs are accepted only if
  // they're the only option for that session — better to mis-link than
  // to leave both wholly unlinked. But sport-mismatch alone (-100) is a
  // hard veto; we skip those entirely.
  const usedSessions = new Set();
  const usedActivities = new Set();
  for (const p of pairs) {
    if (p.score <= SCORE.SPORT_MISMATCH) break;
    if (usedSessions.has(p.session.id)) continue;
    if (usedActivities.has(p.activity.id)) continue;
    bySessionId.set(p.session.id, p.activity);
    byActivityId.set(p.activity.id, p.session);
    usedSessions.add(p.session.id);
    usedActivities.add(p.activity.id);
  }

  const unmatchedActs = activityPool.filter(a => !byActivityId.has(a.id));
  return { bySessionId, byActivityId, unmatchedActs };
}

// Convenience: given a single session and the day's full set, return its
// matched activity (or null). Use this where you'd previously have done
// `actsByDate.get(date)` — it's date-aware AND session-aware.
export function linkedActivityForSession({ session, sessionsOnDate, activitiesOnDate, logs }) {
  if (!session) return null;
  const { bySessionId } = matchActivitiesToSessions({
    sessions: sessionsOnDate || [session],
    activities: activitiesOnDate || [],
    logs: logs || {},
  });
  return bySessionId.get(session.id) || null;
}
