// Training-load and pace-zone math.
//
// Pure functions only — no React, no Supabase. All inputs are primitives so
// the helpers can run anywhere (UI, edge function, tests). The numbers are
// classic Coggan/Daniels approximations: not lab-grade, but the same
// approximations TrainingPeaks ships and good enough to drive coaching
// decisions.
//
// Glossary
//   threshold pace   = lactate-threshold pace in seconds-per-km. The pace an
//                      athlete can hold for ~1 hour all-out. Roughly
//                      half-marathon pace for trained runners.
//   IF (intensity)   = run pace ÷ threshold pace, both as speeds. >1 = harder
//                      than threshold, <1 = easier.
//   rTSS             = (duration_h) · IF² · 100. A 1-hour run AT threshold
//                      = 100 rTSS by definition. Easy hour ~50, hard tempo
//                      ~85, race threshold ~100, 5k race effort ~110-130.

import { parseTime } from "./constants.js";

// Convert "m:ss" / "h:mm:ss" / "1:30:14" / "19:25" to total seconds.
function timeStrToSeconds(value) {
  if (!value) return null;
  const { h, m, s } = parseTime(value);
  const total = h * 3600 + m * 60 + s;
  return total > 0 ? total : null;
}

// "M:SS" / "MM:SS" pace in min/km → seconds/km. Returns null on bad input.
export function paceStrToSecsPerKm(paceStr) {
  if (!paceStr) return null;
  // strip "/km" suffix and any whitespace
  const cleaned = String(paceStr).replace(/\/km|\/mi/i, "").trim();
  return timeStrToSeconds(cleaned);
}

// secs/km back to "m:ss/km" string.
export function secsPerKmToPaceStr(secsPerKm, withUnit = true) {
  if (!secsPerKm || secsPerKm <= 0) return "—";
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, "0");
  return withUnit ? `${m}:${s}/km` : `${m}:${s}`;
}

// Estimate threshold pace (secs/km) from PBs. Uses the closest-distance PB
// available, applying simple Daniels-style offsets:
//   threshold ≈ 5 km pace + 18 s/km
//             ≈ 10 km pace + 8 s/km
//             ≈ HM pace - 2 s/km (HM is very close to threshold for most)
//             ≈ FM pace - 12 s/km (FM is below threshold, so threshold is faster)
//
// Preference order: HM > 10k > 5k > FM (HM is the most direct proxy).
// Returns secs/km, or null if no PB lets us compute one.
export function estimateThresholdPaceSecsPerKm(pbs) {
  if (!pbs || typeof pbs !== "object") return null;
  const tries = [
    { key: "half_marathon", km: 21.0975, offset: -2  },
    { key: "10k",           km: 10,      offset: 8   },
    { key: "5k",            km: 5,       offset: 18  },
    { key: "full_marathon", km: 42.195,  offset: -12 },
  ];
  for (const { key, km, offset } of tries) {
    const totalSec = timeStrToSeconds(pbs[key]);
    if (!totalSec) continue;
    const racePaceSecsPerKm = totalSec / km;
    return Math.round(racePaceSecsPerKm + offset);
  }
  return null;
}

// Best-effort threshold pace. Looks at an explicit profile.threshold_pace
// override first ("4:35" or "4:35/km"), then falls back to PBs.
export function getThresholdPace(profile) {
  if (!profile) return null;
  const explicit = paceStrToSecsPerKm(profile.threshold_pace);
  if (explicit) return explicit;
  return estimateThresholdPaceSecsPerKm(profile.pbs);
}

// rTSS for a single run.
//
//   IF      = thresholdSecsPerKm / runSecsPerKm  (faster run = bigger IF)
//   rTSS    = (durationSec / 3600) · IF² · 100
//
// Returns null if any input is missing/invalid (so callers can render "—").
export function computeRtss({ durationSec, distanceKm, thresholdSecsPerKm }) {
  if (!durationSec || !distanceKm || !thresholdSecsPerKm) return null;
  if (durationSec <= 0 || distanceKm <= 0 || thresholdSecsPerKm <= 0) return null;
  const runSecsPerKm = durationSec / distanceKm;
  if (runSecsPerKm <= 0) return null;
  const intensity = thresholdSecsPerKm / runSecsPerKm;
  const hours = durationSec / 3600;
  return Math.round(hours * intensity * intensity * 100);
}

// rTSS color band — same green/amber/red language we use for compliance.
export function rtssColor(rtss) {
  if (rtss == null) return "var(--c-mute)";
  if (rtss < 40)   return "var(--c-cool)";   // recovery / very easy
  if (rtss < 80)   return "var(--c-accent)"; // standard endurance day
  if (rtss < 120)  return "var(--c-warn)";   // hard tempo / threshold
  return "var(--c-hot)";                      // race / overload
}

// ─── Pace zones (Z1–Z5) ──────────────────────────────────────────────────────
// All zones expressed as multipliers of threshold pace (in secs/km, so a
// SLOWER pace has a HIGHER seconds-per-km value). Bands are widely-used
// running zone definitions:
//   Z1 — recovery       ≥ 1.30 × threshold (≥30% slower)
//   Z2 — easy/aerobic   1.15–1.30 ×
//   Z3 — steady/marathon 1.05–1.15 ×
//   Z4 — threshold/tempo 0.97–1.05 ×
//   Z5 — VO₂max / faster ≤ 0.97 × (≥3% faster than threshold)
//
// We return them ordered Z1→Z5 with the pace ranges (in secs/km) computed from
// the athlete's threshold pace.
export const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];
export const ZONE_NAMES = {
  Z1: "Recovery",
  Z2: "Easy",
  Z3: "Steady",
  Z4: "Threshold",
  Z5: "VO₂",
};
export const ZONE_COLORS = {
  Z1: "var(--c-cool)",   // calm blue
  Z2: "var(--c-accent)", // dusty olive — most-of-week
  Z3: "#7B5A8C",         // muted purple — long-run pace
  Z4: "var(--c-warn)",   // tempo amber
  Z5: "var(--c-hot)",    // VO₂ terracotta
};

export function paceZones(thresholdSecsPerKm) {
  if (!thresholdSecsPerKm) return null;
  // Boundaries: slow→fast. Z1 slower than Z2 → bigger secs/km.
  const Z1max = thresholdSecsPerKm * 1.30;  // anything slower than this = Z1
  const Z2max = thresholdSecsPerKm * 1.15;
  const Z3max = thresholdSecsPerKm * 1.05;
  const Z4max = thresholdSecsPerKm * 0.97;
  return {
    Z1: { lo: Infinity,  hi: Z1max },
    Z2: { lo: Z1max,     hi: Z2max },
    Z3: { lo: Z2max,     hi: Z3max },
    Z4: { lo: Z3max,     hi: Z4max },
    Z5: { lo: Z4max,     hi: 0    },
  };
}

// Map a single secs/km pace → "Z1".."Z5". Returns null if threshold unknown.
export function paceToZone(runSecsPerKm, thresholdSecsPerKm) {
  if (!runSecsPerKm || !thresholdSecsPerKm) return null;
  if (runSecsPerKm >= thresholdSecsPerKm * 1.30) return "Z1";
  if (runSecsPerKm >= thresholdSecsPerKm * 1.15) return "Z2";
  if (runSecsPerKm >= thresholdSecsPerKm * 1.05) return "Z3";
  if (runSecsPerKm >= thresholdSecsPerKm * 0.97) return "Z4";
  return "Z5";
}

// Time-in-zone for a run with split data. `splits` is an array of objects
// with at least { moving_time_s, distance_m } (Strava's splits_metric shape).
// Returns { Z1: seconds, Z2: seconds, ... } and a `total` convenience key.
export function timeInZoneFromSplits(splits, thresholdSecsPerKm) {
  const acc = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, total: 0 };
  if (!Array.isArray(splits) || !thresholdSecsPerKm) return acc;
  for (const sp of splits) {
    const dur = sp.moving_time_s || sp.moving_time;
    const distM = sp.distance_m || sp.distance;
    if (!dur || !distM) continue;
    const km = distM / 1000;
    if (km <= 0) continue;
    const secsPerKm = dur / km;
    const z = paceToZone(secsPerKm, thresholdSecsPerKm);
    if (!z) continue;
    acc[z] += dur;
    acc.total += dur;
  }
  return acc;
}

// Coarse fallback: spread the run's total time into zones based on its
// average pace. Loses nuance but gives the bar something to draw when split
// data isn't available (manual logs, missing Strava detail). Puts 100% of
// the run in the zone its average pace lands in.
export function timeInZoneFromAverage({ durationSec, distanceKm, thresholdSecsPerKm }) {
  const acc = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, total: 0 };
  if (!durationSec || !distanceKm || !thresholdSecsPerKm) return acc;
  const secsPerKm = durationSec / distanceKm;
  const z = paceToZone(secsPerKm, thresholdSecsPerKm);
  if (!z) return acc;
  acc[z] = durationSec;
  acc.total = durationSec;
  return acc;
}

// Best-effort time-in-zone: prefer split data, fall back to average. Returns
// the standard {Z1..Z5,total} shape so callers can render the bar uniformly.
export function timeInZone({ splits, durationSec, distanceKm, thresholdSecsPerKm }) {
  if (Array.isArray(splits) && splits.length) {
    const fromSplits = timeInZoneFromSplits(splits, thresholdSecsPerKm);
    if (fromSplits.total > 0) return fromSplits;
  }
  return timeInZoneFromAverage({ durationSec, distanceKm, thresholdSecsPerKm });
}

// ─── Compliance scoring ──────────────────────────────────────────────────────
// Auto-grade a logged run against its planned target. Returns a band:
//   "completed"  — within ±20% of plan (green)
//   "partial"    — within ±50% (amber)
//   "over"       — >50% over plan (warn — usually still a win)
//   "missed"     — under 50% of plan (red)
//
// Planned target preference: rTSS > distance > duration. The first one we
// have data for wins. Distance is the most reliable for runners (duration
// drifts with pace), but rTSS captures intensity better when available.
export function gradeCompliance({ planned, actual }) {
  if (!planned || !actual) return null;
  // Pick the most-reliable comparable axis.
  const axes = [
    { plan: planned.rtss,        act: actual.rtss        },
    { plan: planned.distance_km, act: actual.distance_km },
    { plan: planned.duration_min, act: actual.duration_min },
  ];
  const axis = axes.find(a => a.plan && a.act);
  if (!axis) return null;
  const ratio = axis.act / axis.plan;
  if (ratio < 0.5)  return "missed";
  if (ratio < 0.8)  return "partial";
  if (ratio <= 1.2) return "completed";
  if (ratio <= 1.5) return "completed";  // a bit over is still on-plan
  return "over";
}

// ─── Performance Management Chart (CTL / ATL / TSB) ─────────────────────────
// CTL = Chronic Training Load — your fitness. 42-day exponentially weighted
//       moving average of daily rTSS. Slow to build, slow to fade.
// ATL = Acute Training Load — your fatigue. 7-day EWMA of daily rTSS. Spikes
//       quickly, decays in a week.
// TSB = Training Stress Balance = CTL - ATL. Positive = fresh / tapered,
//       negative = absorbing load. Race day target is usually +5 to +20.
//
// We use the standard exponential decay form:
//   today = yesterday + (today_rtss - yesterday) × (1 - e^(-1/timeConstant))
// with timeConstant = 42 for CTL and 7 for ATL.

const CTL_TC = 42;
const ATL_TC = 7;
const CTL_K = 1 - Math.exp(-1 / CTL_TC);  // ≈ 0.0235
const ATL_K = 1 - Math.exp(-1 / ATL_TC);  // ≈ 0.1331

// Roll a daily rTSS series into CTL/ATL/TSB time series. `dailyRtss` is an
// array of { date: 'YYYY-MM-DD', rtss: number } sorted ascending. Missing
// days are treated as 0 (the math doesn't tolerate gaps).
//
// Returns an array of { date, rtss, ctl, atl, tsb } the same length as the
// input, each rounded to 1 decimal.
export function computePMC(dailyRtss) {
  if (!Array.isArray(dailyRtss) || dailyRtss.length === 0) return [];
  const out = [];
  let ctl = 0, atl = 0;
  for (const day of dailyRtss) {
    const r = Number(day.rtss) || 0;
    ctl = ctl + (r - ctl) * CTL_K;
    atl = atl + (r - atl) * ATL_K;
    out.push({
      date: day.date,
      rtss: Math.round(r),
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }
  return out;
}

// Build a [{date, rtss}] series from an athlete's activities array.
// Uses each activity's stored rtss when present (edge function will eventually
// backfill these). Falls back to computing on the fly from distance + duration
// + the athlete's threshold pace.
//
// Multiple runs on the same day are summed.
export function dailyRtssFromActivities(activities, profile) {
  const out = [];
  const thr = getThresholdPace(profile);
  for (const a of activities || []) {
    if (!a?.activity_date) continue;
    let rtss = a.rtss != null ? Number(a.rtss) : null;
    if (rtss == null && thr) {
      const distKm = parseFloat(a.distance_km) || null;
      const durSec = a.duration_seconds || null;
      if (distKm && durSec) {
        rtss = computeRtss({ durationSec: durSec, distanceKm: distKm, thresholdSecsPerKm: thr });
      }
    }
    if (!rtss) continue;
    out.push({ date: a.activity_date, rtss });
  }
  return out;
}

// Densify a list of irregular { date, rtss } entries into a daily series
// from `from` (inclusive) to `to` (inclusive). Days with no run get rtss=0.
// Both bounds as 'YYYY-MM-DD'. Used to feed computePMC.
export function densifyDailyRtss(entries, fromDate, toDate) {
  const byDate = new Map();
  for (const e of entries || []) {
    if (!e?.date) continue;
    const r = Number(e.rtss) || 0;
    byDate.set(e.date, (byDate.get(e.date) || 0) + r);  // sum doubles
  }
  const out = [];
  const start = new Date(fromDate + 'T00:00:00');
  const end = new Date(toDate + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || start > end) return out;
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;
    out.push({ date: key, rtss: byDate.get(key) || 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// Resolve "what compliance band does this session deserve right now?"
// Honours an explicit override from the log first (a coach who clicked
// "Mark missed" wins). Falls back to auto-grading planned vs actual, then
// to date-based heuristics. Returns one of: "completed" | "partial" |
// "missed" | "over" | "pending".
export function effectiveCompliance({ session, log, linkedAct, isPastDate, profile }) {
  // 1. Explicit override on the log.
  if (log?.analysis?.compliance) return log.analysis.compliance;

  // 2. Auto-grade from numbers, if we have any logged.
  const an = log?.analysis;
  const actualDistance = an?.distance_km ?? linkedAct?.distance_km ?? null;
  const actualDuration = an?.duration_min
    ?? (linkedAct?.duration_seconds ? Math.round(linkedAct.duration_seconds / 60) : null);

  if (session && (actualDistance || actualDuration)) {
    const plannedDistance = session.distance_km || session.distance || null;
    const plannedDuration = session.duration_min || session.duration || null;

    // If we have threshold pace, derive an rTSS for both planned + actual.
    let plannedRtss = null, actualRtss = null;
    const thr = getThresholdPace(profile);
    if (thr && plannedDuration && plannedDistance) {
      plannedRtss = computeRtss({
        durationSec: plannedDuration * 60,
        distanceKm: plannedDistance,
        thresholdSecsPerKm: thr,
      });
    }
    if (thr && actualDuration && actualDistance) {
      actualRtss = computeRtss({
        durationSec: actualDuration * 60,
        distanceKm: actualDistance,
        thresholdSecsPerKm: thr,
      });
    }

    const graded = gradeCompliance({
      planned: { distance_km: plannedDistance, duration_min: plannedDuration, rtss: plannedRtss },
      actual:  { distance_km: actualDistance, duration_min: actualDuration, rtss: actualRtss },
    });
    if (graded) return graded;
  }

  // 3. Logged but no plan, or vice-versa: heuristics.
  if (log || linkedAct) return "completed";
  const isRest = (session?.type || "").toUpperCase() === "REST";
  if (isPastDate && session && !isRest) return "missed";
  return "pending";
}
