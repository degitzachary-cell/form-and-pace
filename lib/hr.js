// Heart-rate analytics. Pure functions — no React, no Supabase.
//
// The app already syncs HR from Strava (avg_heartrate, max_heartrate, and
// per-split avg_heartrate inside strava_data) but every metric so far is
// pace-only. These helpers turn that latent HR data into the kind of analysis
// TrainingPeaks gates behind WKO5: HR zones, efficiency factor, and aerobic
// decoupling — plus the max-HR plumbing the readiness model needs.
//
// HR zones are the widely-used 5-zone %HRmax model:
//   Z1  < 60%   recovery
//   Z2  60–70%  easy / aerobic
//   Z3  70–80%  steady / marathon
//   Z4  80–90%  threshold / tempo
//   Z5  ≥ 90%   VO₂ / anaerobic
// Labels intentionally match the pace ZONE_LABELS (Z1..Z5) so the UI can reuse
// the same colour language.

export const HR_ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"];

// Explicit profile.max_hr wins; otherwise estimate from the highest max_hr
// ever observed across the athlete's activities. Returns null if we have
// nothing to go on (caller renders a "set your max HR" empty state).
export function getMaxHr(profile, activities) {
  const explicit = Number(profile?.max_hr);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  let best = 0;
  for (const a of activities || []) {
    const m = Number(a?.strava_data?.max_heartrate);
    if (Number.isFinite(m) && m > best) best = m;
  }
  return best > 0 ? best : null;
}

// Resting HR: explicit profile value only (we don't get a reliable resting HR
// from run data). Returns null when unset.
export function getRestingHr(profile) {
  const r = Number(profile?.resting_hr);
  return Number.isFinite(r) && r > 0 ? r : null;
}

// Map a single HR bpm → "Z1".."Z5" against max HR. Returns null if unusable.
export function hrToZone(hr, maxHr) {
  if (!hr || !maxHr || maxHr <= 0) return null;
  const pct = hr / maxHr;
  if (pct < 0.60) return "Z1";
  if (pct < 0.70) return "Z2";
  if (pct < 0.80) return "Z3";
  if (pct < 0.90) return "Z4";
  return "Z5";
}

// Time-in-HR-zone from Strava splits (each carries avg_heartrate + a duration).
// Returns { Z1..Z5: seconds, total } so the UI can draw the same bar it draws
// for pace zones. Empty (total 0) when there's no usable HR/duration.
export function timeInHrZone(splits, maxHr) {
  const acc = { Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, total: 0 };
  if (!Array.isArray(splits) || !maxHr) return acc;
  for (const sp of splits) {
    const hr = sp.avg_heartrate ?? sp.average_heartrate;
    const dur = sp.moving_time_s ?? sp.moving_time;
    if (!hr || !dur) continue;
    const z = hrToZone(hr, maxHr);
    if (!z) continue;
    acc[z] += dur;
    acc.total += dur;
  }
  return acc;
}

// Efficiency Factor: speed per heartbeat — metres-per-minute divided by avg HR.
// Rising EF at the same effort over weeks is the classic aerobic-fitness
// signal. Returns null when inputs are missing.
export function efficiencyFactor({ distanceKm, durationSec, avgHr }) {
  if (!distanceKm || !durationSec || !avgHr) return null;
  if (distanceKm <= 0 || durationSec <= 0 || avgHr <= 0) return null;
  const metresPerMin = (distanceKm * 1000) / (durationSec / 60);
  return Math.round((metresPerMin / avgHr) * 1000) / 1000;
}

// Aerobic decoupling (a.k.a. Pw:HR / Pa:HR drift): does pace-per-heartbeat fade
// in the second half of a run? Splits the run in two by cumulative time, takes
// the speed-per-HR (EF) of each half, and returns the % drop from first to
// second half. >5% suggests the athlete ran past their aerobic durability — a
// fatigue/under-fuelling signal TP charges for. Returns null if there aren't
// enough HR+pace splits to judge (needs ≥4).
export function aerobicDecoupling(splits) {
  if (!Array.isArray(splits)) return null;
  const usable = splits
    .map(sp => {
      const hr = sp.avg_heartrate ?? sp.average_heartrate;
      const dur = sp.moving_time_s ?? sp.moving_time;
      const distM = sp.distance_m ?? sp.distance;
      if (!hr || !dur || !distM) return null;
      return { hr, dur, speed: distM / dur };
    })
    .filter(Boolean);
  if (usable.length < 4) return null;

  const totalTime = usable.reduce((s, x) => s + x.dur, 0);
  const half = totalTime / 2;
  // EF of a set of splits = time-weighted mean speed ÷ time-weighted mean HR.
  const efOf = (rows) => {
    const t = rows.reduce((s, x) => s + x.dur, 0);
    if (t <= 0) return null;
    const speed = rows.reduce((s, x) => s + x.speed * x.dur, 0) / t;
    const hr = rows.reduce((s, x) => s + x.hr * x.dur, 0) / t;
    return hr > 0 ? speed / hr : null;
  };

  const first = [], second = [];
  let acc = 0;
  for (const x of usable) {
    (acc < half ? first : second).push(x);
    acc += x.dur;
  }
  if (!first.length || !second.length) return null;
  const ef1 = efOf(first), ef2 = efOf(second);
  if (!ef1 || !ef2) return null;
  // Positive = slowed for the same HR (decoupled); negative = negative-split.
  return Math.round(((ef1 - ef2) / ef1) * 1000) / 10; // one-decimal percent
}

// Verdict band for a decoupling percentage, for colour-coding.
//   "coupled"   ≤ 5%   well within aerobic durability
//   "drifting"  5–10%  some fade
//   "decoupled" > 10%  ran past durability / under-fuelled
export function decouplingBand(pct) {
  if (pct == null) return null;
  if (pct <= 5) return "coupled";
  if (pct <= 10) return "drifting";
  return "decoupled";
}
