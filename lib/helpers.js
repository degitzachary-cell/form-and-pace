// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
export function getWeekBounds(weeksAgo = 0) {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

const DAY_OFFSET = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };

export function sessionDateStr(weekStart, dayAbbrev) {
  if (!weekStart) return null;
  const offset = DAY_OFFSET[dayAbbrev?.slice(0, 3)] ?? 0;
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + offset);
  return ymd(d);
}

export function ymd(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

export function weekEndStr(weekStart) {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return ymd(d);
}

export function todayStr() {
  return ymd(new Date());
}

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
export function fmtPace(mps, withUnit = true) {
  if (!mps || mps <= 0) return "–";
  const secsPerKm = 1000 / mps;
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, "0");
  return withUnit ? `${m}:${s}/km` : `${m}:${s}`;
}

export function fmtTime(secs) {
  if (!secs) return "–";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${s}` : `${m}:${s}`;
}

// ─── KM AGGREGATION ───────────────────────────────────────────────────────────
export function weekKm(activities, email, weeksAgo = 0) {
  const { monday, sunday } = getWeekBounds(weeksAgo);
  const target = email?.toLowerCase();
  let sum = 0;
  for (const a of activities) {
    if (target && a.athlete_email !== target) continue;
    const d = new Date(a.activity_date);
    if (d >= monday && d <= sunday) sum += parseFloat(a.distance_km || 0);
  }
  return sum;
}

export function stravaWeekKm(stravaActivities, storedStravaIds, weeksAgo = 0) {
  const { monday, sunday } = getWeekBounds(weeksAgo);
  let sum = 0;
  for (const a of stravaActivities) {
    if (storedStravaIds.has(a.id)) continue;
    const dateStr = (a.start_date_local || a.start_date || "").slice(0, 10);
    if (!dateStr) continue;
    const [y, mo, dy] = dateStr.split("-").map(Number);
    const d = new Date(y, mo - 1, dy, 12, 0, 0);
    if (d >= monday && d <= sunday) sum += (a.distance || 0) / 1000;
  }
  return sum;
}

// ─── COMPLIANCE STATS ─────────────────────────────────────────────────────────
export function getStats(program, activities, logs, email) {
  const target = email?.toLowerCase();
  const sessions = (program?.weeks || []).flatMap(w =>
    w.sessions.map(s => ({ ...s, sessionDate: sessionDateStr(w.weekStart, s.day) }))
  );
  const total = sessions.length;
  const athActDates = new Set(
    activities.filter(a => a.athlete_email === target).map(a => a.activity_date)
  );
  let done = 0, missed = 0, partial = 0;
  for (const s of sessions) {
    const c = logs[s.id]?.analysis?.compliance;
    if (c === "missed") missed++;
    else if (c === "partial") partial++;
    if (c === "completed" || c === "partial" || athActDates.has(s.sessionDate)) done++;
  }
  const rate = total ? Math.round((done/total)*100) : 0;
  return { total, done, missed, partial, rate };
}

// ─── STRAVA DATA EXTRACT ──────────────────────────────────────────────────────
export function extractStravaData(detail) {
  return {
    id:               detail.id,
    name:             detail.name,
    distance_m:       detail.distance,
    moving_time_s:    detail.moving_time,
    elapsed_time_s:   detail.elapsed_time,
    avg_speed_mps:    detail.average_speed,
    avg_heartrate:    detail.average_heartrate || null,
    max_heartrate:    detail.max_heartrate || null,
    elevation_gain_m: detail.total_elevation_gain || null,
    avg_cadence:      detail.average_cadence ? Math.round(detail.average_cadence * 2) : null,
    splits: (detail.splits_metric || []).map(sp => ({
      split:           sp.split,
      distance_m:      sp.distance,
      moving_time_s:   sp.moving_time,
      elapsed_time_s:  sp.elapsed_time,
      avg_speed_mps:   sp.average_speed,
      avg_heartrate:   sp.average_heartrate || null,
      avg_cadence:     sp.average_cadence ? Math.round(sp.average_cadence * 2) : null,
    })),
    laps: (detail.laps || []).map(lp => ({
      lap_index:       lp.lap_index,
      name:            lp.name,
      distance_m:      lp.distance,
      moving_time_s:   lp.moving_time,
      elapsed_time_s:  lp.elapsed_time,
      avg_speed_mps:   lp.average_speed,
      avg_heartrate:   lp.average_heartrate || null,
      avg_cadence:     lp.average_cadence ? Math.round(lp.average_cadence * 2) : null,
    })),
  };
}

export function newId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Last-resort display name when an athlete has no profile and no
// coach-supplied metadata: "jeremy" → "Jeremy", "zhang.1701" → "Zhang".
export function prettyEmailName(email) {
  if (!email) return "";
  const local = email.split("@")[0];
  const cleaned = local.replace(/[._-]+/g, " ").replace(/\d+/g, "").trim();
  if (!cleaned) return local;
  return cleaned.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
