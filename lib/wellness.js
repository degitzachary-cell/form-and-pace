// Wellness-derived training metrics.
//
// Four composable layers, each operating at a different time scale and
// decision point:
//
//   1. sRPE          — per-session subjective load (Foster 2001).
//                      Replaces a missing rTSS on sessions that don't
//                      give us pace data: strength, hyrox, manual logs.
//   2. Hooper        — daily morning state, normalised to the athlete's
//                      personal baseline (Hooper & Mackinnon 1995).
//   3. effortDrift   — per-session quality check. Did the logged RPE
//                      match the planned target for that workout type?
//   4. readinessScore — single verdict combining ACWR (Gabbett 2016),
//                      Hooper deviation, and recent drift.
//
// Conflict-prevention is wired in by construction:
//
//   * sessionLoad() returns ONE load value per session — rTSS preferred
//     when valid, sRPE-converted-to-rTSS-units as fallback. Never sums
//     both (would double-count effort).
//   * Drift is categorical, never a load signal. RPE feeds load OR
//     drift, never both downstream of a single value.
//   * sRPE is converted into rTSS-equivalent units via a calibrated
//     athlete-specific factor before entering PMC, so the existing
//     CTL/ATL math doesn't see two different unit systems.
//   * All baselines are personal (rolling median + MAD), not absolute,
//     so a 6-hour sleeper isn't perpetually flagged.
//   * Each function reports a `confidence` field. readinessScore needs
//     a quorum of ok-confidence inputs before recommending a change —
//     prevents single-signal alert fatigue and cold-start noise.
//   * Positive TSB / undercooked-ACWR is never escalated. Taper and
//     deload weeks shouldn't trip the alarm.

import { computeRtss, getThresholdPace, isRunActivityType, defaultRpeTarget } from "./load.js";

// ─── 1. sRPE (Foster session-RPE) ────────────────────────────────────────────
// sRPE = RPE (0-10) × duration in minutes. Empirically validated against
// HR-based TRIMP across endurance, team, and combat sports. The unit is
// arbitrary ("AU"); we scale into rTSS-equivalents before feeding PMC.

export function srpe(rpe, durationMin) {
  if (!rpe || !durationMin) return null;
  if (rpe <= 0 || rpe > 10) return null;
  if (durationMin <= 0) return null;
  return Math.round(rpe * durationMin);
}

// Athlete-specific scaling: median ratio of rTSS / sRPE on runs that
// produced both a valid rTSS and an RPE+duration. Median is robust to
// the few sessions where the athlete misjudged effort.
//
// Falls back to 0.20 (a literature-typical endurance ratio: easy hour
// ≈ 50 rTSS ≈ 250 sRPE) when fewer than MIN_SAMPLES paired sessions
// exist. The default is conservative; an under-calibrated factor will
// slightly under-count strength load rather than over-count it.
const DEFAULT_SRPE_FACTOR = 0.20;
const MIN_PAIRED_SAMPLES = 5;

export function calibrateSrpeFactor({ activities, logs, profile }) {
  const thr = getThresholdPace(profile);
  if (!thr) return { factor: DEFAULT_SRPE_FACTOR, sampleCount: 0, source: "default" };
  const ratios = [];
  for (const a of activities || []) {
    if (!isRunActivityType(a.activity_type)) continue;
    const distKm = parseFloat(a.distance_km);
    const durSec = a.duration_seconds;
    if (!distKm || !durSec) continue;
    // Look up the matching session log (if any) for this activity's RPE.
    const matchedLog = (Object.values(logs || {}) || []).find(l =>
      l?.athlete_email?.toLowerCase() === a.athlete_email?.toLowerCase()
      && l?.analysis?.actual_date === a.activity_date
    );
    const rpe = matchedLog?.analysis?.wellness?.rpe;
    if (!rpe) continue;
    const rtss = computeRtss({ durationSec: durSec, distanceKm: distKm, thresholdSecsPerKm: thr });
    const s = srpe(rpe, durSec / 60);
    if (!rtss || !s) continue;
    ratios.push(rtss / s);
  }
  if (ratios.length < MIN_PAIRED_SAMPLES) {
    return { factor: DEFAULT_SRPE_FACTOR, sampleCount: ratios.length, source: "default" };
  }
  ratios.sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  // Clamp to a sane band to avoid one-off pace outliers wrecking the factor.
  const clamped = Math.max(0.10, Math.min(0.40, median));
  return { factor: clamped, sampleCount: ratios.length, source: "personal" };
}

// Canonical "load for one session". rTSS for runs (validated, pace-based);
// sRPE-converted-to-rTSS-units otherwise. Returns null when neither path
// can produce a number.
//
// Inputs:
//   activity   — Strava-shaped row from the activities table (or null)
//   log        — session_log row with analysis.wellness (or null)
//   profile    — athlete profile (for threshold pace)
//   srpeFactor — output of calibrateSrpeFactor().factor
export function sessionLoad({ activity, log, profile, srpeFactor }) {
  // 1. Pre-stored rTSS on the activity wins (it's been blessed already).
  if (activity?.rtss != null && Number(activity.rtss) > 0) return Math.round(Number(activity.rtss));

  const thr = getThresholdPace(profile);
  const distKm = parseFloat(activity?.distance_km) || log?.analysis?.distance_km || null;
  const durMin = (activity?.duration_seconds ? activity.duration_seconds / 60 : null)
              || log?.analysis?.duration_min || null;

  // 2. Fresh rTSS for run activities with everything we need.
  const looksLikeRun = activity ? isRunActivityType(activity.activity_type) : true;
  if (looksLikeRun && distKm && durMin && thr) {
    const rtss = computeRtss({ durationSec: durMin * 60, distanceKm: distKm, thresholdSecsPerKm: thr });
    if (rtss) return rtss;
  }

  // 3. sRPE fallback. Works for strength, hyrox, manual entries, and
  // any run where threshold pace isn't set. RPE pulled from wellness
  // on the linked log — activities don't carry RPE directly.
  const rpe = log?.analysis?.wellness?.rpe;
  if (rpe && durMin) {
    const s = srpe(rpe, durMin);
    if (s) return Math.round(s * (srpeFactor ?? DEFAULT_SRPE_FACTOR));
  }
  return null;
}

// Daily load series for PMC. Iterates activities first (existing data
// path), then sweeps in any session log that doesn't have a matching
// activity row — that catches manually-logged strength / cross-training
// where there's no Strava import.
//
// Multiple sessions on the same day SUM (matches dailyRtssFromActivities).
// activity-source dedupe prevents counting the same session twice when
// the activities table holds a `source: "session"` mirror of the log.
export function dailyLoadFromActivitiesAndLogs({ activities, logs, profile }) {
  const { factor } = calibrateSrpeFactor({ activities, logs, profile });
  const out = [];
  // Index logs by (email, actual_date) so we can look up matching wellness
  // for an activity, AND know which logs are already represented.
  const logsByDateEmail = new Map();
  for (const log of Object.values(logs || {})) {
    if (!log?.analysis?.actual_date) continue;
    const key = `${(log.athlete_email || "").toLowerCase()}|${log.analysis.actual_date}`;
    logsByDateEmail.set(key, log);
  }
  const consumedLogIds = new Set();

  for (const a of activities || []) {
    if (!a?.activity_date) continue;
    const key = `${(a.athlete_email || "").toLowerCase()}|${a.activity_date}`;
    const matchedLog = logsByDateEmail.get(key) || null;
    if (matchedLog) consumedLogIds.add(matchedLog.id);
    const load = sessionLoad({ activity: a, log: matchedLog, profile, srpeFactor: factor });
    if (!load) continue;
    out.push({ date: a.activity_date, rtss: load });
  }

  // Logs without a matching activity: pure manual entries. sRPE-only path.
  for (const log of Object.values(logs || {})) {
    if (!log?.analysis?.actual_date) continue;
    if (consumedLogIds.has(log.id)) continue;
    const load = sessionLoad({ activity: null, log, profile, srpeFactor: factor });
    if (!load) continue;
    out.push({ date: log.analysis.actual_date, rtss: load });
  }

  return out;
}

// ─── 2. Hooper Index (daily readiness state) ────────────────────────────────
// Classic Hooper sums sleep / fatigue / soreness / stress on 1-7 scales
// where higher = worse. We only collect three of those (sleep_hours,
// soreness 1-5, mood 1-5), so we normalise each into a [0..1] "stress
// score" and average. The absolute number means little — its deviation
// from the athlete's personal rolling baseline is what matters.

// Single-day Hooper from a wellness object. Returns null if no usable
// fields present, otherwise { score: 0-1, components: count }.
export function hooperRaw(wellness) {
  if (!wellness) return null;
  const items = [];
  // Soreness 1-5 (1=none, 5=wrecked) — already higher=worse.
  if (wellness.soreness != null) items.push((Number(wellness.soreness) - 1) / 4);
  // Mood 1-5 (1=awful, 5=flying) — invert so higher=worse.
  if (wellness.mood != null) items.push((5 - Number(wellness.mood)) / 4);
  // Sleep hours: piecewise. 8h = 0 stress, 4h = 1, smooth in between.
  // Above 8h doesn't reduce stress further (no benefit modelled).
  if (wellness.sleep_hours != null) {
    const h = Number(wellness.sleep_hours);
    let s;
    if (h >= 8) s = 0;
    else if (h <= 4) s = 1;
    else s = (8 - h) / 4;
    items.push(s);
  }
  if (items.length === 0) return null;
  const mean = items.reduce((a, b) => a + b, 0) / items.length;
  return { score: mean, components: items.length };
}

// Build a date → { score, components } map. If the athlete edits their
// wellness later in the day the most-recent timestamped log wins —
// prevents the same day being "scored twice" when both quick-checkin
// and full feedback are submitted.
export function dailyHooperSeries(logs) {
  const byDate = new Map();
  const tsByDate = new Map();
  for (const log of Object.values(logs || {})) {
    const w = log?.analysis?.wellness;
    const date = log?.analysis?.actual_date;
    if (!w || !date) continue;
    const ts = log.updated_at || log.created_at || "";
    const prevTs = tsByDate.get(date) || "";
    if (ts >= prevTs) {
      const h = hooperRaw(w);
      if (h) { byDate.set(date, h); tsByDate.set(date, ts); }
    }
  }
  return byDate;
}

// Personal baseline: median + MAD (median absolute deviation) over the
// last `windowDays` days BEFORE asOfDate. MAD is robust to outliers
// (one terrible night doesn't shift the baseline). Returns confidence:
//   "ok"  — enough samples
//   "low" — still warming up
const HOOPER_BASELINE_WINDOW_DAYS = 28;
const HOOPER_BASELINE_MIN_SAMPLES = 7;
const MAD_FLOOR = 0.05;  // avoid div-by-zero when athlete is very consistent

export function hooperBaseline(seriesMap, asOfDate, opts = {}) {
  const windowDays = opts.windowDays ?? HOOPER_BASELINE_WINDOW_DAYS;
  const minSamples = opts.minSamples ?? HOOPER_BASELINE_MIN_SAMPLES;
  if (!seriesMap || !asOfDate) return { confidence: "low", reason: "no data", sampleCount: 0 };
  const end = new Date(asOfDate + "T00:00:00");
  const start = new Date(end); start.setDate(end.getDate() - windowDays);
  const values = [];
  for (const [date, h] of seriesMap) {
    const d = new Date(date + "T00:00:00");
    if (d >= start && d < end) values.push(h.score);
  }
  if (values.length < minSamples) {
    return { confidence: "low", reason: `${values.length}/${minSamples} samples in window`, sampleCount: values.length };
  }
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const deviations = values.map(v => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = Math.max(deviations[Math.floor(deviations.length / 2)] || 0, MAD_FLOOR);
  return { confidence: "ok", median, mad, sampleCount: values.length };
}

// Today's reading on the athlete's personal scale.
//   level: "fresh" | "normal" | "elevated" | "alarm"
//   z:     z-score relative to baseline (positive = more stressed)
// Returns confidence "low" when either today's wellness is missing OR
// the baseline isn't established yet — readinessScore() ignores
// low-confidence inputs.
export function hooperToday({ logs, asOfDate }) {
  const series = dailyHooperSeries(logs);
  const today = series.get(asOfDate);
  if (!today) {
    return { confidence: "low", reason: "no wellness logged today", level: null, z: null };
  }
  const baseline = hooperBaseline(series, asOfDate);
  if (baseline.confidence === "low") {
    return { confidence: "low", reason: baseline.reason, level: null, z: null, raw: today.score };
  }
  const z = (today.score - baseline.median) / baseline.mad;
  let level;
  if (z < -0.5) level = "fresh";
  else if (z < 0.5) level = "normal";
  else if (z < 1.5) level = "elevated";
  else level = "alarm";
  return { confidence: "ok", level, z, raw: today.score, baseline: baseline.median, sampleCount: baseline.sampleCount };
}

// ─── 3. Effort drift (logged RPE vs prescribed target) ──────────────────────
// The coach sets `session.rpe_target` per workout; defaults come from
// RPE_TARGET_BY_TYPE in load.js. Drift compares the athlete's logged
// RPE against that band.

// Parse "3-4" or "4" or "" into [lo, hi] or null.
function parseRpeRange(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  if (t.includes("-")) {
    const [a, b] = t.split("-").map(n => parseFloat(n.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return [Math.min(a, b), Math.max(a, b)];
  }
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return [n, n];
}

// Per-session drift verdict.
//   "under" — logged RPE > 1 below target band (workout was too easy)
//   "ok"    — within ±1 of target band
//   "over"  — logged RPE > 1 above target band
//   null    — no target / no logged RPE / REST day
//
// We use ±1 tolerance because RPE is self-reported on a coarse 10-point
// scale; tighter bands would fire constantly on noise.
export function effortDrift({ session, log }) {
  if (!session || !log) return null;
  const type = (session.type || "").toUpperCase();
  if (type === "REST") return null;
  const target = parseRpeRange(session.rpe_target || defaultRpeTarget(type));
  if (!target) return null;
  const rpe = log?.analysis?.wellness?.rpe;
  if (rpe == null) return null;
  const [lo, hi] = target;
  if (Number(rpe) < lo - 1) return "under";
  if (Number(rpe) > hi + 1) return "over";
  return "ok";
}

// Recent drift summary for the readiness check. Counts only EASY and
// RECOVERY sessions — those are the ones where "felt harder than it
// should" is the canonical fatigue early-warning. Hard sessions
// drifting hot is expected behaviour and isn't useful as a signal.
const DRIFT_WINDOW_DAYS = 14;
const DRIFT_MIN_EASY_SESSIONS = 3;

export function recentEasyDrift({ sessions, logs, asOfDate, windowDays = DRIFT_WINDOW_DAYS }) {
  if (!asOfDate) return { confidence: "low", reason: "no date", easyOver: 0, easyTotal: 0 };
  const end = new Date(asOfDate + "T00:00:00");
  const start = new Date(end); start.setDate(end.getDate() - windowDays);
  let easyOver = 0, easyTotal = 0;
  for (const session of sessions || []) {
    const type = (session.type || "").toUpperCase();
    if (type !== "EASY" && type !== "RECOVERY") continue;
    const log = logs?.[session.id];
    const date = log?.analysis?.actual_date;
    if (!date) continue;
    const d = new Date(date + "T00:00:00");
    if (d < start || d >= end) continue;
    const drift = effortDrift({ session, log });
    if (!drift) continue;
    easyTotal++;
    if (drift === "over") easyOver++;
  }
  if (easyTotal < DRIFT_MIN_EASY_SESSIONS) {
    return { confidence: "low", reason: `${easyTotal}/${DRIFT_MIN_EASY_SESSIONS} easy runs in window`, easyOver, easyTotal };
  }
  return { confidence: "ok", easyOver, easyTotal, ratio: easyOver / easyTotal };
}

// ─── 4. Readiness verdict (single source of truth) ──────────────────────────
// Combines ACWR, Hooper deviation, and recent easy-run drift into ONE
// label. Quorum-based: needs ≥2 ok-confidence inputs AND ≥2 vote-points
// before recommending a change. Without that gate, any one bad night's
// sleep or one hot easy run would generate alerts the athlete learns
// to ignore.

// ACWR (Gabbett 2016): ratio of acute (ATL, 7-day) to chronic (CTL,
// 42-day) load. The 0.8–1.3 "sweet spot" is associated with the lowest
// injury rates in the original cohort. >1.5 is the "danger zone".
// Below 0.8 is detraining, but we don't escalate that — a deload week
// is fine, an injured athlete tapering is fine.
function acwrLevel(ctl, atl) {
  if (!ctl || ctl < 5) return null;  // not enough fitness baseline yet
  const acwr = atl / ctl;
  if (acwr < 0.8) return { acwr, level: "undercooked" };
  if (acwr <= 1.3) return { acwr, level: "sweet" };
  if (acwr <= 1.5) return { acwr, level: "high" };
  return { acwr, level: "spike" };
}

// readinessScore inputs:
//   pmcTail — { ctl, atl, tsb } — latest PMC row, or null if PMC not computable
//   hooper  — output of hooperToday()
//   drift   — output of recentEasyDrift()
//
// Returns:
//   {
//     verdict:    "go" | "caution" | "back-off",
//     severity:   0 | 1 | 2,
//     reasons:    [string],   // human-readable bullet points
//     inputsUsed: [string],   // which signals had ok confidence
//     neutral:    bool,       // true when not enough signals to decide
//   }
export function readinessScore({ pmcTail, hooper, drift }) {
  const reasons = [];
  const inputsUsed = [];
  let cautionVotes = 0;
  let backOffVotes = 0;

  // ACWR — only counts toward the quorum when CTL is meaningful.
  const acwr = pmcTail ? acwrLevel(pmcTail.ctl, pmcTail.atl) : null;
  if (acwr) {
    inputsUsed.push("acwr");
    if (acwr.level === "high") {
      cautionVotes++;
      reasons.push(`Acute load ${acwr.acwr.toFixed(2)}× chronic — high but still in safe range`);
    } else if (acwr.level === "spike") {
      backOffVotes++;
      reasons.push(`Acute load spike ${acwr.acwr.toFixed(2)}× chronic — Gabbett "danger zone"`);
    }
  }

  // Hooper — personal baseline z-score.
  if (hooper && hooper.confidence === "ok") {
    inputsUsed.push("hooper");
    if (hooper.level === "elevated") {
      cautionVotes++;
      reasons.push(`Wellness elevated vs your baseline (z = ${hooper.z.toFixed(1)})`);
    } else if (hooper.level === "alarm") {
      backOffVotes++;
      reasons.push(`Wellness alarm vs your baseline (z = ${hooper.z.toFixed(1)})`);
    }
  }

  // Drift — easy runs creeping hot. ≥40% over-target counts as a vote.
  if (drift && drift.confidence === "ok") {
    inputsUsed.push("drift");
    if (drift.ratio >= 0.4) {
      cautionVotes++;
      reasons.push(`${drift.easyOver}/${drift.easyTotal} recent easy runs felt harder than target`);
    }
  }

  // Quorum guard. Without ≥2 confident signals, stay neutral — better
  // to be silent than fire on noise.
  if (inputsUsed.length < 2) {
    return {
      verdict: "go",
      severity: 0,
      reasons: [],
      inputsUsed,
      neutral: true,
      reason: "Not enough wellness data yet — keep checking in",
    };
  }

  // Escalation rules:
  //   2 caution votes OR 1 back-off vote alone           → caution
  //   2 back-off votes OR (1 back-off + 1 caution)       → back-off
  if (backOffVotes >= 2 || (backOffVotes >= 1 && cautionVotes >= 1)) {
    return { verdict: "back-off", severity: 2, reasons, inputsUsed };
  }
  if (cautionVotes >= 2 || backOffVotes >= 1) {
    return { verdict: "caution", severity: 1, reasons, inputsUsed };
  }
  return { verdict: "go", severity: 0, reasons, inputsUsed };
}

// Friendly labels for the UI — keeps the rendering layer from having
// to know about the verdict enum.
export const READINESS_LABELS = {
  go:        { headline: "Good to train",    cue: "Signals look clean — train as planned." },
  caution:   { headline: "Train with care",  cue: "A couple of signals are flashing. Consider easing the intensity." },
  "back-off":{ headline: "Back off today",   cue: "Multiple recovery signals stacked. Swap for easy or rest." },
};
