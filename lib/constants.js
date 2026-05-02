// Shared constants and pure helpers used across screens.
// Kept dependency-free so any screen / context module can import freely.

// Distance categories used in the profile form. "other" is free text;
// the rest are time-based with H:MM:SS dropdowns. All fields are optional.
export const PROFILE_DISTANCES = [
  { key: "5k",             label: "5km",           withHours: false },
  { key: "10k",            label: "10km",          withHours: false },
  { key: "half_marathon",  label: "Half Marathon", withHours: true  },
  { key: "full_marathon",  label: "Full Marathon", withHours: true  },
];

export const EMPTY_PB_GOAL = { "5k": "", "10k": "", "half_marathon": "", "full_marathon": "", "other": "" };

export const PB_GOAL_LABEL = { "5k": "5K", "10k": "10K", "half_marathon": "HM", "full_marathon": "FM" };

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

// Parse a stored time string like "19:25" or "1:30:14" into its parts.
export function parseTime(value) {
  const parts = (value || "").split(":").map(p => p.trim());
  if (parts.length >= 3) return { h: +parts[0] || 0, m: +parts[1] || 0, s: +parts[2] || 0 };
  if (parts.length === 2) return { h: 0, m: +parts[0] || 0, s: +parts[1] || 0 };
  return { h: 0, m: 0, s: 0 };
}

// plan_json comes in two shapes: a bare weeks array (legacy) or an object with
// {athleteName, athleteGoal, athletePb, weeks, defaultWeek?}. Returns
// { weeks, meta } regardless. `meta.defaultWeek` is the per-athlete week
// shape the coach can re-stamp into new weeks (see CoachPlanBuilder).
export function normalizePlan(pj) {
  if (!pj) return { weeks: [], meta: {} };
  if (Array.isArray(pj)) return { weeks: pj, meta: {} };
  if (typeof pj === "object") {
    return {
      weeks: Array.isArray(pj.weeks) ? pj.weeks : [],
      meta: {
        name:        pj.athleteName || undefined,
        goal:        pj.athleteGoal || undefined,
        current:     pj.athletePb   || undefined,
        defaultWeek: pj.defaultWeek || undefined,
      },
    };
  }
  return { weeks: [], meta: {} };
}

// Strip empty fields out of a pbs/goals object. Returns null if nothing's left,
// so we don't end up with `{}` rows in the DB.
export function cleanPbGoal(obj) {
  if (!obj || typeof obj !== "object") return null;
  const cleaned = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) cleaned[k] = v.trim();
  }
  return Object.keys(cleaned).length ? cleaned : null;
}

// Render a pbs/goals object as "5K 19:25 · HM 1:30:14 · FM 3:15:42"
// (plus the free-text "other" appended last).
export function fmtPbGoal(obj) {
  if (!obj || typeof obj !== "object") return null;
  const parts = [];
  for (const k of ["5k", "10k", "half_marathon", "full_marathon"]) {
    if (obj[k]) parts.push(`${PB_GOAL_LABEL[k]} ${obj[k]}`);
  }
  if (obj.other) parts.push(obj.other);
  return parts.length ? parts.join(" · ") : null;
}
