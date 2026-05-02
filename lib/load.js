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

// Render a stored pace string with a consistent "/km" unit. Coaches
// enter pace inconsistently — some include "/km", some don't — so we
// strip whatever's there and re-append a single canonical suffix.
// Idempotent: safe to call on already-formatted values.
//
// Pace strings can also be free-form labels (e.g. "Easy 5:45 / HM
// 5:20–5:25"), in which case appending "/km" would be wrong, so we
// only append when the string still parses as a single time / range
// of times after the strip.
export function displayPace(paceStr) {
  if (!paceStr) return paceStr;
  const stripped = String(paceStr).replace(/\s*\/(km|mi)\b/gi, "").trim();
  if (!stripped) return stripped;
  // Single time ("5:30") or hyphenated range ("5:30-5:45" / "5:30–5:45").
  const isSimpleTime = /^\d{1,2}:\d{2}([-–]\d{1,2}:\d{2})?$/.test(stripped);
  if (!isSimpleTime) return stripped;
  return `${stripped}/km`;
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

// ─── Auto-tag run type from a Strava-shaped activity ────────────────────────
// Rule-based classifier — runs entirely on the data already fetched. Used
// when the athlete logs an activity outside the plan (no session.type to
// inherit) so the coach view doesn't fill up with generic "Run" labels.
//
// Returns one of: "LONG" | "SPEED" | "TEMPO" | "EASY" | "RECOVERY".
//
// Inputs:
//   distanceKm        — required
//   durationSec       — required
//   splits            — array of { moving_time_s, distance_m } if available
//   thresholdSecsPerKm— from athlete profile
//
// Heuristic order (first hit wins):
//   1. Distance ≥ 18 km OR duration ≥ 100 min → LONG
//   2. Splits available + variance high + fastest splits in Z4/Z5 → SPEED
//   3. ≥ 20% of time in Z4+Z5 OR avg pace within Z4 → TEMPO
//   4. Avg pace ≥ 1.30 × threshold (slower than easy) → RECOVERY
//   5. else → EASY
export function autoClassifyRunType({ distanceKm, durationSec, splits, thresholdSecsPerKm }) {
  if (!distanceKm || !durationSec) return "EASY";

  // 1. Long
  if (distanceKm >= 18 || durationSec >= 100 * 60) return "LONG";

  // No threshold pace — fall back to distance-only heuristics.
  if (!thresholdSecsPerKm) {
    if (distanceKm >= 10) return "EASY";
    return "EASY";
  }

  const avgSecsPerKm = durationSec / distanceKm;
  const avgZone = paceToZone(avgSecsPerKm, thresholdSecsPerKm);

  // 2. Speed — needs splits to detect interval pattern.
  if (Array.isArray(splits) && splits.length >= 4) {
    const splitPaces = splits
      .map(s => {
        const km = (s.distance_m || s.distance) / 1000;
        const sec = s.moving_time_s || s.moving_time;
        return km > 0 ? sec / km : null;
      })
      .filter(p => p && isFinite(p));
    if (splitPaces.length >= 4) {
      const mean = splitPaces.reduce((a, b) => a + b, 0) / splitPaces.length;
      const variance = splitPaces.reduce((a, b) => a + (b - mean) ** 2, 0) / splitPaces.length;
      const stdev = Math.sqrt(variance);
      const cv = stdev / mean;  // coefficient of variation
      // High split variance + at least one split in Z5 → speed work.
      const fastestSec = Math.min(...splitPaces);
      const hasFastSplit = paceToZone(fastestSec, thresholdSecsPerKm) === "Z5"
                        || paceToZone(fastestSec, thresholdSecsPerKm) === "Z4";
      if (cv > 0.10 && hasFastSplit) return "SPEED";
    }
  }

  // 3. Tempo — significant Z4 time or avg pace lands in Z4.
  if (Array.isArray(splits) && splits.length) {
    const tiz = timeInZoneFromSplits(splits, thresholdSecsPerKm);
    if (tiz.total > 0) {
      const z4Plus = (tiz.Z4 + tiz.Z5) / tiz.total;
      if (z4Plus > 0.20) return "TEMPO";
    }
  }
  if (avgZone === "Z4") return "TEMPO";

  // 4. Recovery — significantly slower than easy.
  if (avgSecsPerKm >= thresholdSecsPerKm * 1.35) return "RECOVERY";

  // 5. Default.
  return "EASY";
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

// ─── Structured workout steps ────────────────────────────────────────────────
// A session can carry an optional steps[] array as an alternative to (or
// alongside) its free-text desc. The shape is intentionally small:
//
//   { kind: "warmup",   duration_min, pace?, note? }
//   { kind: "cooldown", duration_min, pace?, note? }
//   { kind: "steady",   duration_min, distance_km, pace?, note? }
//   { kind: "interval", reps,
//                       work:     { distance_m | duration_s, pace? },
//                       recovery: { distance_m | duration_s, pace? } }
//
// All numeric fields are optional individually — the renderer just skips
// missing values. Pace is stored as a min/km string ("4:35") and parsed by
// paceStrToSecsPerKm at compute time.

// Default target RPE per workout type. The coach can override per workout
// via session.rpe_target. Returned as a "lo-hi" string so the editor can
// pre-fill a range that's easy to dial up or down. RPE is the 1-10 Borg
// scale: 1=walking, 4=easy run, 7=tempo/threshold, 9=5K race, 10=all-out.
export const RPE_TARGET_BY_TYPE = {
  EASY:        "3-4",
  RECOVERY:    "2-3",
  "LONG RUN":  "4-6",
  LONG:        "4-6",
  TEMPO:       "6-7",
  SPEED:       "8-9",
  HYROX:       "8-10",
  "RACE DAY":  "9-10",
  RACE:        "9-10",
  REST:        "",
  STRENGTH:    "5-6",
};
export function defaultRpeTarget(type) {
  if (!type) return "3-4";
  return RPE_TARGET_BY_TYPE[String(type).toUpperCase()] ?? "3-4";
}

// The pace shown on the headline / pace strip when a session has structured
// steps. We prefer the first "work" block (interval > steady > workout)
// because that's the prescription that matters; warm-up and cool-down paces
// are usually nominal. Falls back to whichever step has a pace if nothing
// labelled work exists.
export function dominantPace(session) {
  if (!session) return null;
  if (session.pace) return session.pace;
  if (!Array.isArray(session.steps)) return null;
  const work = session.steps.find(s => s.kind === "interval" && (s.work?.pace || s.pace));
  if (work) return work.work?.pace || work.pace;
  const steady = session.steps.find(s => s.kind === "steady" && s.pace);
  if (steady) return steady.pace;
  const anyPace = session.steps.find(s => s.pace);
  return anyPace ? anyPace.pace : null;
}

export function isStructured(session) {
  return Array.isArray(session?.steps) && session.steps.length > 0;
}

const fmtMin = (m) => (m || m === 0) ? `${m} min` : null;

// Render one step as a single-line summary string. Pure formatting — no JSX.
// Examples:
//   "Warm-up · 15 min @ 5:30"
//   "Easy · 8 km @ 5:10"
//   "6 × 800 m @ 3:35 / 90 s easy"
export function formatStep(step) {
  if (!step || !step.kind) return "";
  switch (step.kind) {
    case "warmup":
    case "cooldown": {
      const label = step.kind === "warmup" ? "Warm-up" : "Cool-down";
      const bits = [fmtMin(step.duration_min), step.pace && `@ ${step.pace}`].filter(Boolean);
      return `${label}${bits.length ? " · " + bits.join(" ") : ""}`;
    }
    case "steady": {
      // Honour the unit toggle — if the coach is on TIME mode, the km field
      // is stale (left from before the toggle); ignore it. Same for DISTANCE.
      const unit = step.unit || (step.distance_km ? "km" : "min");
      const dist = unit === "km" && step.distance_km ? `${step.distance_km} km` : null;
      const time = unit === "min" ? fmtMin(step.duration_min) : null;
      const reps = Number(step.reps) || 1;
      const lead = step.note?.trim() || "Steady";
      const block = [dist || time, step.pace && `@ ${step.pace}`].filter(Boolean).join(" ");
      const head  = reps > 1 ? `${reps} × ${block}` : (block ? `${lead} · ${block}` : lead);
      // Optional rest between reps when reps > 1.
      if (reps > 1) {
        const r = step.rest || {};
        const rDist = r.distance_m ? `${r.distance_m} m` : null;
        const rTime = r.duration_s ? `${r.duration_s} s` : (r.duration_min ? `${r.duration_min} min` : null);
        const rVal  = rDist || rTime;
        const rStyle = r.style === "float" ? "float" : r.style === "jog" ? "jog" : "rest";
        const rest  = rVal ? `${rVal} ${rStyle}` : null;
        return `${head}${rest ? ` / ${rest}` : ""}`;
      }
      return head;
    }
    case "interval": {
      // "20 × 400 m @ 3:35 w/ 60 s float"
      // recovery.style: rest (standing) | jog (default) | float
      const reps = step.reps || 1;
      const w = step.work || {};
      const r = step.recovery || {};
      const wDesc = w.distance_m ? `${w.distance_m} m` : (w.duration_s ? `${w.duration_s}s` : "?");
      const wPace = w.pace ? ` @ ${w.pace}` : "";
      const rDesc = r.distance_m ? `${r.distance_m} m` : (r.duration_s ? `${r.duration_s} s` : "");
      const rStyle = r.style === "rest"  ? " rest"
                  : r.style === "float" ? " float"
                  : rDesc                ? " jog"
                  : "";
      const recovery = rDesc ? ` w/ ${rDesc}${rStyle}` : "";
      return `${reps} × ${wDesc}${wPace}${recovery}`;
    }
    case "recovery": {
      // Style: jog (slow easy pace) or float (moderate, faster than jog
      // but slower than work). Surfaced in the description so the athlete
      // knows what effort to hold during recovery.
      const unit = step.unit || (step.distance_km ? "km" : "min");
      const dist = unit === "km" && step.distance_km ? `${step.distance_km} km` : null;
      const time = unit === "min" ? fmtMin(step.duration_min) : null;
      const styleLabel = step.style === "float" ? "float" : "jog";
      const bits = [dist || time, styleLabel, step.pace && `@ ${step.pace}`].filter(Boolean);
      return `Recovery${bits.length ? " · " + bits.join(" ") : ""}`;
    }
    case "strides": {
      // Pure time-based block, attached to easy runs. No pace — strides
      // are run by feel, fast but controlled.
      const reps = step.reps || 6;
      const stride = step.stride_s ? `${step.stride_s} s` : "?";
      const rest   = step.rest_s   ? `${step.rest_s} s rest` : "standing rest";
      return `${reps} × ${stride} strides / ${rest}`;
    }
    default:
      return step.note || "";
  }
}

// Approximate planned numbers for a structured session. Useful for compliance
// grading and rTSS estimation when a coach hasn't typed top-level numbers.
// Returns { duration_min, distance_km } — both optional.
export function aggregateSteps(steps) {
  const acc = { duration_min: 0, distance_km: 0 };
  if (!Array.isArray(steps)) return acc;
  for (const s of steps) {
    // For warm-up / cool-down / recovery / steady, the unit toggle decides
    // which field is authoritative. Steady can also have reps + rest, in
    // which case the per-rep duration/distance is multiplied.
    if (s.kind === "warmup" || s.kind === "cooldown" || s.kind === "recovery") {
      const unit = s.unit || (s.distance_km ? "km" : "min");
      if (unit === "min" && s.duration_min) acc.duration_min += Number(s.duration_min) || 0;
      if (unit === "km"  && s.distance_km)  acc.distance_km  += Number(s.distance_km)  || 0;
    } else if (s.kind === "steady") {
      const unit = s.unit || (s.distance_km ? "km" : "min");
      const reps = Math.max(1, Number(s.reps) || 1);
      if (unit === "min" && s.duration_min) acc.duration_min += reps * (Number(s.duration_min) || 0);
      if (unit === "km"  && s.distance_km)  acc.distance_km  += reps * (Number(s.distance_km)  || 0);
      const r = s.rest || {};
      if (reps > 1) {
        if (r.duration_s)   acc.duration_min += ((reps - 1) * Number(r.duration_s)) / 60;
        if (r.duration_min) acc.duration_min += (reps - 1) * Number(r.duration_min);
        if (r.distance_m)   acc.distance_km  += ((reps - 1) * Number(r.distance_m)) / 1000;
      }
    } else if (s.duration_min) {
      acc.duration_min += Number(s.duration_min) || 0;
    } else if (s.distance_km) {
      acc.distance_km += Number(s.distance_km) || 0;
    }
    if (s.kind === "interval") {
      const reps = Number(s.reps) || 1;
      const w = s.work || {}, r = s.recovery || {};
      if (w.distance_m) acc.distance_km += (reps * Number(w.distance_m)) / 1000;
      if (r.distance_m) acc.distance_km += (reps * Number(r.distance_m)) / 1000;
      if (w.duration_s) acc.duration_min += (reps * Number(w.duration_s)) / 60;
      if (r.duration_s) acc.duration_min += (reps * Number(r.duration_s)) / 60;
    }
    if (s.kind === "strides") {
      // Strides + rest both count toward total time. Distance can't be
      // estimated reliably without an athlete pace, so skip it.
      const reps = Number(s.reps) || 0;
      if (reps && s.stride_s) acc.duration_min += (reps * Number(s.stride_s)) / 60;
      if (reps && s.rest_s)   acc.duration_min += (reps * Number(s.rest_s))   / 60;
    }
  }
  acc.duration_min = Math.round(acc.duration_min);
  acc.distance_km  = Math.round(acc.distance_km * 10) / 10;
  return acc;
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

// Project CTL/ATL/TSB forward from a starting state through a series of
// future daily rTSS values. Use this to ask "if the athlete does these
// planned workouts in the next N days, where will their fitness/fatigue/
// form land?" Same exponential filter as computePMC.
//
// `start`: { ctl, atl } from today's PMC tail.
// `futureRtss`: array of { date, rtss } in chronological order.
// Returns the array with ctl/atl/tsb appended to each entry.
export function forecastPMC(start, futureRtss) {
  if (!Array.isArray(futureRtss) || futureRtss.length === 0) return [];
  let ctl = Number(start?.ctl) || 0;
  let atl = Number(start?.atl) || 0;
  const out = [];
  for (const day of futureRtss) {
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

// Estimate rTSS for a planned session before it happens. Uses the session's
// top-level distance/duration if available, else aggregates from steps[].
// Falls back to null if neither distance nor duration are known or if the
// athlete has no threshold pace set.
export function plannedSessionRtss(session, profile) {
  if (!session) return null;
  const isRest = (session.type || "").toUpperCase() === "REST";
  if (isRest) return null;
  const thr = getThresholdPace(profile);
  if (!thr) return null;
  let distKm = session.distance_km || session.distance || null;
  let durMin = session.duration_min || session.duration || null;
  if ((!distKm || !durMin) && Array.isArray(session.steps) && session.steps.length) {
    const agg = aggregateSteps(session.steps);
    distKm = distKm || (agg.distance_km > 0 ? agg.distance_km : null);
    durMin = durMin || (agg.duration_min > 0 ? agg.duration_min : null);
  }
  if (!distKm || !durMin) return null;
  return computeRtss({ durationSec: durMin * 60, distanceKm: distKm, thresholdSecsPerKm: thr });
}

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
// Multiple runs on the same day are summed. Skips non-run activities — rTSS
// is run-specific (uses pace vs threshold pace), so cycling / strength /
// swim activities don't contribute to running PMC.
export function dailyRtssFromActivities(activities, profile) {
  const out = [];
  const thr = getThresholdPace(profile);
  for (const a of activities || []) {
    if (!a?.activity_date) continue;
    if (!isRunActivityType(a.activity_type)) continue;
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

// Treats null / undefined / any run-flavoured type as a run. Matches both
// the picker labels ("Easy Run", "Long Run") and the bare session-type
// strings ("EASY", "LONG RUN", "RECOVERY") since the session-log flow
// stores the latter. Strength, Ride, Swim, Workout, Walk, Hike etc. are
// NOT runs.
const _RUN_ACTIVITY_TYPES = new Set([
  "run", "easy", "easy run", "long", "long run", "tempo", "speed",
  "recovery", "trail run", "race", "race day",
]);
export function isRunActivityType(type) {
  if (type == null) return true;
  return _RUN_ACTIVITY_TYPES.has(String(type).toLowerCase());
}

// Same as dailyRtssFromActivities but accepts the raw Strava list format
// (distance in metres, moving_time in seconds, start_date_local as ISO string).
// rTSS only makes sense for runs — bike, swim, strength etc. are skipped here
// (PMC needs sport-specific load formulas which we don't compute yet).
export function dailyRtssFromStravaList(stravaActivities, profile) {
  const thr = getThresholdPace(profile);
  if (!thr) return [];
  const out = [];
  for (const a of stravaActivities || []) {
    const sport = a.sport_type || a.type;
    if (sport && sport !== "Run" && sport !== "TrailRun" && sport !== "VirtualRun") continue;
    const date = a.start_date_local?.split("T")[0];
    if (!date) continue;
    const distKm = a.distance ? a.distance / 1000 : null;
    const durSec = a.moving_time || null;
    if (!distKm || !durSec) continue;
    const rtss = computeRtss({ durationSec: durSec, distanceKm: distKm, thresholdSecsPerKm: thr });
    if (rtss) out.push({ date, rtss });
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

// Does this log represent a real entry from the athlete (not just a
// drag-move stub or empty placeholder)? A row with only `actual_date` set
// — or an empty analysis altogether — is metadata, not a logged session.
// We require at least one piece of completion evidence: explicit
// compliance, distance, duration, rTSS, wellness, feedback, or a coach
// reply (which implies the athlete logged something for the coach to
// reply to).
export function isLogReal(log) {
  if (!log) return false;
  const an = log.analysis;
  if (an && (an.compliance || an.distance_km || an.duration_min || an.rtss || an.wellness)) return true;
  if (log.feedback && String(log.feedback).trim()) return true;
  if (log.coach_reply) return true;
  return false;
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
    // Prefer top-level numbers; if absent, derive from structured steps[]
    // (an interval session's "planned distance" is the sum of work + recovery).
    let plannedDistance = session.distance_km || session.distance || null;
    let plannedDuration = session.duration_min || session.duration || null;
    if ((!plannedDistance || !plannedDuration) && Array.isArray(session.steps) && session.steps.length) {
      const agg = aggregateSteps(session.steps);
      plannedDistance = plannedDistance || (agg.distance_km > 0 ? agg.distance_km : null);
      plannedDuration = plannedDuration || (agg.duration_min > 0 ? agg.duration_min : null);
    }

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

  // 3. Logged but no plan, or vice-versa: heuristics. Only count as
  // "completed" if the log has real data — a drag-move stub with only
  // actual_date does NOT mean the session was completed.
  if (isLogReal(log) || linkedAct) return "completed";
  const isRest = (session?.type || "").toUpperCase() === "REST";
  if (isPastDate && session && !isRest) return "missed";
  return "pending";
}

// ─── Zone-relative pace expansion ────────────────────────────────────────────
// Workout seeds use Daniels zone tokens (E / M / T / I / R) so a single
// template scales to any athlete's threshold. expandZonePace() turns a
// token like "T" or "E-M" or "5:10" into an absolute pace string the rest
// of the app already understands.
//
// Multipliers are on threshold pace TIME (seconds per km). Easy is slower
// so its multiplier is > 1. The ranges produce a "fast-slow" output that
// matches the existing pace-range syntax used by PaceRangeInput.
const ZONE_RANGE = {
  E: { fast: 1.16, slow: 1.28 }, // easy
  M: { fast: 1.08, slow: 1.13 }, // marathon
  T: { fast: 0.99, slow: 1.02 }, // threshold
  I: { fast: 0.92, slow: 0.95 }, // VO2 / 5K pace
  R: { fast: 0.85, slow: 0.89 }, // repetition / mile pace
};

function paceFromSecs(secs) {
  if (!secs || !isFinite(secs)) return null;
  const total = Math.round(secs);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Expand a single zone token (e.g. "E", "T", "I") to a pace range string.
// Returns null if the input isn't a known zone token.
function expandSingleZone(token, thresholdSecsPerKm) {
  const r = ZONE_RANGE[token];
  if (!r || !thresholdSecsPerKm) return null;
  return `${paceFromSecs(thresholdSecsPerKm * r.fast)}-${paceFromSecs(thresholdSecsPerKm * r.slow)}`;
}

// Resolve a pace string from a workout seed against the athlete's threshold.
//   "T"     → "4:25-4:35"
//   "E-M"   → "5:12-4:55" (easy fast-end through marathon slow-end)
//   "T-I"   → "4:35-4:10"
//   "5:10"  → "5:10"      (already absolute, pass through)
//   ""      → ""
// If the athlete has no threshold pace set, zone tokens are returned
// unchanged so the coach can see them and prompt the athlete to set their
// threshold pace.
export function expandZonePace(token, profile) {
  if (!token) return token;
  const t = String(token).trim().toUpperCase();
  if (!/^[EMTIR](-[EMTIR])?$/.test(t)) return token; // not a zone token; pass through
  const thr = getThresholdPace(profile);
  if (!thr) return token;
  if (!t.includes("-")) return expandSingleZone(t, thr);
  const [a, b] = t.split("-");
  const ra = ZONE_RANGE[a], rb = ZONE_RANGE[b];
  if (!ra || !rb) return token;
  // Range across two zones: fast end of the faster zone, slow end of the slower.
  const fast = Math.min(ra.fast, rb.fast);
  const slow = Math.max(ra.slow, rb.slow);
  return `${paceFromSecs(thr * fast)}-${paceFromSecs(thr * slow)}`;
}

// Walk a workout seed and replace every zone-token pace with the athlete's
// absolute pace. Used at template-apply time so the editor / saved plan
// only ever stores concrete paces.
export function resolveSeedForAthlete(seed, profile) {
  if (!seed) return seed;
  const out = { ...seed };
  if (out.pace) out.pace = expandZonePace(out.pace, profile);
  if (Array.isArray(out.steps)) {
    out.steps = out.steps.map(step => {
      const s = { ...step };
      if (s.pace) s.pace = expandZonePace(s.pace, profile);
      if (s.work) s.work = { ...s.work, pace: expandZonePace(s.work.pace, profile) };
      if (s.recovery) s.recovery = { ...s.recovery, pace: expandZonePace(s.recovery.pace, profile) };
      return s;
    });
  }
  return out;
}

// ─── Race predictor ──────────────────────────────────────────────────────────
// Riegel's endurance formula: a known time at one distance predicts another.
//   T2 = T1 * (D2/D1)^k
// k = 1.06 is the canonical fade for sub-marathon. For marathon predictions
// from shorter distances, fatigue resistance dominates and k creeps up to
// ~1.07-1.08 — we use 1.07 when projecting beyond ~30km from a sub-30 PB.
export function riegelPredict(seconds1, km1, km2) {
  if (!seconds1 || !km1 || !km2) return null;
  const ratio = km2 / km1;
  const k = (km2 >= 30 && km1 < 30) ? 1.07 : 1.06;
  return seconds1 * Math.pow(ratio, k);
}

// "1:23:45" or "23:45" → seconds. Returns null on bad input.
export function pbStrToSeconds(s) {
  if (!s) return null;
  const parts = String(s).split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

// Seconds → "1:23:45" (or "23:45" if under an hour and `withHours=false`).
export function secondsToTimeStr(s, withHours = false) {
  if (s == null || s < 0 || !isFinite(s)) return null;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0 || withHours) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const RACE_DISTANCES_KM = {
  "5k": 5,
  "10k": 10,
  "half_marathon": 21.0975,
  "full_marathon": 42.195,
};

// Given an athlete's PBs map ({ "5k": "23:14", ... }), returns predicted
// times for every distance keyed by the same keys, where each value is
// { seconds, isActual }. Actual PBs are returned as-is; missing distances
// are predicted from the athlete's strongest reference (lowest 5K-equivalent).
export function predictRaces(pbs) {
  if (!pbs) return {};
  const entries = [];
  for (const [k, v] of Object.entries(pbs)) {
    const km = RACE_DISTANCES_KM[k];
    if (!km || !v) continue;
    const sec = pbStrToSeconds(v);
    if (sec) entries.push({ key: k, km, seconds: sec });
  }
  if (!entries.length) return {};

  // Best reference = the PB whose 5K-equivalent (via Riegel) is the fastest.
  let best = entries[0];
  let bestEquiv = riegelPredict(best.seconds, best.km, 5);
  for (const e of entries.slice(1)) {
    const eq = riegelPredict(e.seconds, e.km, 5);
    if (eq && eq < bestEquiv) { best = e; bestEquiv = eq; }
  }

  const out = {};
  for (const [k, km] of Object.entries(RACE_DISTANCES_KM)) {
    const actual = entries.find(e => e.key === k);
    if (actual) {
      out[k] = { seconds: actual.seconds, isActual: true };
    } else {
      const predSec = riegelPredict(best.seconds, best.km, km);
      if (predSec) out[k] = { seconds: predSec, isActual: false };
    }
  }
  return out;
}
