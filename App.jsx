import { useState, useEffect, useMemo } from "react";
import CoachPlanBuilder from "./CoachPlanBuilder";
import { supabase, STRAVA_CLIENT_ID, exchangeStravaCode, stravaCall } from "./lib/supabase.js";
import {
  weekKm, stravaWeekKm, sessionDateStr, weekEndStr,
  extractStravaData, getStats, prettyEmailName, todayStr,
} from "./lib/helpers.js";
import { C, S, TAG_STYLE, COMPLY_COLOR, COMPLY_LABEL, TAG_EMOJI } from "./styles.js";
import { Header, SectionCard, StatPill, MiniStat, StravaCard, StravaActivityPicker } from "./components.jsx";
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

// ─── ATHLETE PROGRAMS ─────────────────────────────────────────────────────────
// Programs are stored in the coach_plans table; coaches edit via Plan Builder.
// New athletes get a blank program until their coach creates one.
const ATHLETE_PROGRAMS = {};

// Distance categories used in the profile form. "other" is free text;
// the rest are time-based with H:MM:SS dropdowns. All fields are optional.
const PROFILE_DISTANCES = [
  { key: "5k",             label: "5km",           withHours: false },
  { key: "10k",            label: "10km",          withHours: false },
  { key: "half_marathon",  label: "Half Marathon", withHours: true  },
  { key: "full_marathon",  label: "Full Marathon", withHours: true  },
];

// Parse a stored time string like "19:25" or "1:30:14" into its parts.
function parseTime(value) {
  const parts = (value || "").split(":").map(p => p.trim());
  if (parts.length >= 3) return { h: +parts[0] || 0, m: +parts[1] || 0, s: +parts[2] || 0 };
  if (parts.length === 2) return { h: 0, m: +parts[0] || 0, s: +parts[1] || 0 };
  return { h: 0, m: 0, s: 0 };
}

// Three dropdowns (hours optional). Emits a string in MM:SS or H:MM:SS form,
// or an empty string when all three values are zero.
function TimeSelect({ value, onChange, withHours }) {
  const { h, m, s } = parseTime(value);
  const selectStyle = { ...S.input, padding: "8px 6px", fontSize: 12, flex: 1, minWidth: 0 };
  const update = (nh, nm, ns) => {
    if (!nh && !nm && !ns) return onChange("");
    if (nh > 0 || withHours) onChange(`${nh}:${String(nm).padStart(2, "0")}:${String(ns).padStart(2, "0")}`);
    else onChange(`${nm}:${String(ns).padStart(2, "0")}`);
  };
  const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => i + start);
  return (
    <div style={{ display: "flex", gap: 3, flex: 1 }}>
      {withHours && (
        <select value={h} onChange={e => update(+e.target.value, m, s)} style={selectStyle}>
          {range(0, 7).map(i => <option key={i} value={i}>{i}h</option>)}
        </select>
      )}
      <select value={m} onChange={e => update(h, +e.target.value, s)} style={selectStyle}>
        {range(0, withHours ? 59 : 99).map(i => <option key={i} value={i}>{i}m</option>)}
      </select>
      <select value={s} onChange={e => update(h, m, +e.target.value)} style={selectStyle}>
        {range(0, 59).map(i => <option key={i} value={i}>{i}s</option>)}
      </select>
    </div>
  );
}
const EMPTY_PB_GOAL = { "5k": "", "10k": "", "half_marathon": "", "full_marathon": "", "other": "" };

const PB_GOAL_LABEL = { "5k": "5K", "10k": "10K", "half_marathon": "HM", "full_marathon": "FM" };

// Strip empty fields out of a pbs/goals object. Returns null if nothing's left,
// so we don't end up with `{}` rows in the DB.
function cleanPbGoal(obj) {
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
function fmtPbGoal(obj) {
  if (!obj || typeof obj !== "object") return null;
  const parts = [];
  for (const k of ["5k", "10k", "half_marathon", "full_marathon"]) {
    if (obj[k]) parts.push(`${PB_GOAL_LABEL[k]} ${obj[k]}`);
  }
  if (obj.other) parts.push(obj.other);
  return parts.length ? parts.join(" · ") : null;
}

// ─── ATHLETE WEEK GRID ────────────────────────────────────────────────────────
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG   = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

function DraggableSession({ session, log, linkedAct, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `session:${session.id}`,
  });
  const ts = TAG_STYLE[session.tag] || TAG_STYLE.easy;
  const isLogged = !!log || !!linkedAct;
  const style = {
    background: isLogged ? "#f0f7ee" : C.white,
    border: `1px solid ${isLogged ? "#b8d4b4" : C.rule}`,
    borderRadius: 2,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "grab",
    touchAction: "none",
    opacity: isDragging ? 0.4 : 1,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: isDragging ? "none" : "transform 120ms ease",
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onClick={onClick}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: ts.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
        {log?.analysis?.emoji || (session.tag === "speed" ? "⚡" : session.tag === "tempo" ? "🎯" : "🏃")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.type}</div>
          {isLogged && <div style={{ fontSize: 10, color: C.green, flexShrink: 0 }}>✓</div>}
        </div>
        <div style={{ fontSize: 11, color: ts.accent, marginTop: 2, fontFamily: "monospace" }}>{session.pace}</div>
        {(linkedAct || log?.analysis?.distance_km) && (
          <div style={{ fontSize: 10, color: C.mid, marginTop: 2 }}>
            {linkedAct?.distance_km ?? log?.analysis?.distance_km}km
            {linkedAct?.duration_seconds ? ` · ${Math.round(linkedAct.duration_seconds / 60)}min` : log?.analysis?.duration_min ? ` · ${log.analysis.duration_min}min` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function ExtraActivityCard({ act, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: "#1a0505", border: "1px solid #7f1d1d", borderRadius: 2,
      padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
    }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#3b0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>➕</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#fffdf8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{act.activity_type || "Run"}</div>
          <div style={{ fontSize: 10, color: C.crimson, flexShrink: 0 }}>EXTRA</div>
        </div>
        <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>
          {act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds / 60)}min` : ""}
        </div>
      </div>
    </div>
  );
}

function DayRow({ dateStr, dayLabel, isToday, children, hasItems, onAddRun }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dateStr || dayLabel}` });
  const datePart = dateStr ? dateStr.slice(5).replace("-", "/") : "";
  const dayHeader = datePart ? `${dayLabel.toUpperCase()} · ${datePart}` : dayLabel.toUpperCase();
  return (
    <div ref={setNodeRef} style={{
      marginBottom: 12,
      border: `1px dashed ${isOver ? C.crimson : "transparent"}`,
      borderRadius: 4,
      padding: isOver ? 4 : 0,
      transition: "border-color 120ms ease, padding 120ms ease",
    }}>
      <div style={{
        fontSize: 10, letterSpacing: 2, color: isToday ? C.crimson : C.mid,
        fontWeight: isToday ? 700 : 500, marginBottom: 4, paddingLeft: 2,
      }}>{dayHeader}{isToday ? " · TODAY" : ""}</div>
      {hasItems ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      ) : (
        <div style={{
          background: C.white, border: `1px dashed ${C.rule}`, borderRadius: 2,
          padding: "12px", fontSize: 11, color: C.mid, textAlign: "center", letterSpacing: 1,
        }}>NO WORKOUT</div>
      )}
      {onAddRun && (
        <button onClick={onAddRun} style={{
          marginTop: 6, width: "100%", background: "transparent",
          border: `1px dashed ${C.rule}`, borderRadius: 2, padding: "6px 10px",
          color: C.mid, fontSize: 10, letterSpacing: 2, cursor: "pointer",
        }}>+ ADD RUN</button>
      )}
    </div>
  );
}

// Shared form used by athlete self-edit and coach edit-on-behalf screens.
function ProfileForm({ form, setForm, email }) {
  const inputStyle = { ...S.input };
  const labelStyle = { fontSize: 10, letterSpacing: 2, color: C.mid, textTransform: "uppercase", marginBottom: 6 };
  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setNested = (group, k) => (e) => setForm(f => ({ ...f, [group]: { ...f[group], [k]: e.target.value } }));
  return (
    <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 2, padding: "16px 18px", marginBottom: 14 }}>
      {email && (
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>Email (cannot be changed)</div>
          <input style={{ ...inputStyle, background: C.lightRule, color: C.mid }} value={email} disabled />
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <div style={labelStyle}>Name</div>
        <input style={inputStyle} value={form.name} onChange={setField("name")} placeholder="Full name" />
      </div>
      <div style={{ marginBottom: 18 }}>
        <div style={labelStyle}>Avatar (initials)</div>
        <input style={inputStyle} maxLength={3} value={form.avatar} onChange={setField("avatar")} placeholder="e.g. JB" />
      </div>

      <div style={{ fontSize: 10, letterSpacing: 2, color: C.crimson, textTransform: "uppercase", marginBottom: 4 }}>PBs &amp; Goals</div>
      <div style={{ fontSize: 11, color: C.mid, marginBottom: 10, lineHeight: 1.5 }}>
        Leave any field blank if you don't have a PB or goal for that distance.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 6, paddingLeft: 110 }}>
        <div style={{ flex: 1, ...labelStyle, marginBottom: 0 }}>Current PB</div>
        <div style={{ flex: 1, ...labelStyle, marginBottom: 0 }}>Goal</div>
      </div>

      {PROFILE_DISTANCES.map(({ key, label, withHours }) => (
        <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: "0 0 102px", fontSize: 13, color: C.navy, fontWeight: 600 }}>{label}</div>
          <TimeSelect value={form.pbs[key]   || ""} onChange={v => setForm(f => ({ ...f, pbs:   { ...f.pbs,   [key]: v } }))} withHours={withHours} />
          <TimeSelect value={form.goals[key] || ""} onChange={v => setForm(f => ({ ...f, goals: { ...f.goals, [key]: v } }))} withHours={withHours} />
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 4 }}>
        <div style={{ flex: "0 0 102px", fontSize: 13, color: C.navy, fontWeight: 600, paddingTop: 8 }}>Other</div>
        <textarea style={{ ...S.textarea, flex: 1, minHeight: 50 }} value={form.pbs.other   || ""} onChange={setNested("pbs",   "other")} placeholder="e.g. Trail 50km PB" />
        <textarea style={{ ...S.textarea, flex: 1, minHeight: 50 }} value={form.goals.other || ""} onChange={setNested("goals", "other")} placeholder="e.g. Sub-elite by 2027" />
      </div>
    </div>
  );
}


// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user,          setUser]          = useState(null);
  const [role,          setRole]          = useState(null);    // "coach" | "athlete"
  const [authLoading,   setAuthLoading]   = useState(true);
  const [authError,     setAuthError]     = useState(null);

  // Athlete state
  const [screen,        setScreen]        = useState("home");
  const [activeSession, setActiveSession] = useState(null);
  const [activeExtraActivity, setActiveExtraActivity] = useState(null);
  const [activeMonday, setActiveMonday] = useState(null);
  const [coachWeekIdx, setCoachWeekIdx] = useState(null);
  const [feedbackText,  setFeedbackText]  = useState("");
  const [sessionDistKm, setSessionDistKm] = useState("");
  const [sessionDurMin, setSessionDurMin] = useState("");
  const [sessionDateOverride, setSessionDateOverride] = useState(null);
  const [isSaving,     setIsSaving]      = useState(false);
  const [hoveredWeekIdx, setHoveredWeekIdx] = useState(null);

  // Profile editor state — used by both athlete (self-edit) and coach
  // (edit-on-behalf). The form is populated when entering either profile screen.
  const [profileForm, setProfileForm] = useState({ name: "", avatar: "", pbs: { ...EMPTY_PB_GOAL }, goals: { ...EMPTY_PB_GOAL } });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState(null);

  // Coach state
  const [coachScreen,   setCoachScreen]   = useState("dashboard");
  const [dashAthlete,   setDashAthlete]   = useState(null);
  const [coachReply,    setCoachReply]    = useState("");
  const [athletePrograms, setAthletePrograms] = useState(ATHLETE_PROGRAMS);

  // Load saved plans from Supabase. Athletes only see their own plan;
  // coaches see every plan.
  useEffect(() => {
    if (!user || !role) return;
    const loadPlans = async () => {
      const email = user.email?.toLowerCase();
      let q = supabase.from('coach_plans').select('*');
      if (role === 'athlete') q = q.eq('athlete_email', email);
      const { data, error } = await q;
      if (error) {
        console.error('Failed to load coach plans:', error);
        return;
      }
      setAthletePrograms(prev => {
        const updated = { ...prev };
        data.forEach(row => {
          const key = row.athlete_email?.toLowerCase();
          if (!key) return;
          const existing = updated[key] || {};
          // plan_json is either a bare weeks array (legacy) or an object with
          // athleteName/athleteGoal/athletePb/weeks. Coaches edit name/goal/PB
          // straight into the plan so athletes who haven't signed in yet still
          // render correctly.
          const pj = row.plan_json;
          let weeks = [];
          let meta = {};
          if (Array.isArray(pj)) weeks = pj;
          else if (pj && typeof pj === 'object') {
            weeks = Array.isArray(pj.weeks) ? pj.weeks : [];
            meta = {
              name:    pj.athleteName || undefined,
              goal:    pj.athleteGoal || undefined,
              current: pj.athletePb   || undefined,
            };
          }
          updated[key] = {
            ...existing,
            ...Object.fromEntries(Object.entries(meta).filter(([,v]) => v)),
            weeks,
          };
        });
        return updated;
      });
    };
    loadPlans();
  }, [user, role]);

  // Coaches need every athlete's profile (name / goal / PB / avatar) so the
  // dashboard cards aren't blank. Athletes only need their own profile, which
  // resolveUser already loaded.
  useEffect(() => {
    if (!user || role !== 'coach') return;
    const coachEmail = user.email?.toLowerCase();
    const loadAthleteProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('email, name, goal, current_pb, avatar, role');
      if (error) {
        console.error('Failed to load athlete profiles:', error);
        return;
      }
      setAthletePrograms(prev => {
        const updated = { ...prev };
        data.forEach(p => {
          const key = p.email?.toLowerCase();
          if (!key || key === coachEmail) return;
          if (p.role === 'coach') return;
          const existing = updated[key] || {};
          updated[key] = {
            ...existing,
            // Profile values overwrite coach-plan placeholders only when
            // the profile actually has a value (athletes who logged in).
            ...(p.name        ? { name:    p.name        } : {}),
            ...(p.goal        ? { goal:    p.goal        } : {}),
            ...(p.current_pb  ? { current: p.current_pb  } : {}),
            ...(p.avatar      ? { avatar:  p.avatar      } : {}),
            ...(p.pbs         ? { pbs:     p.pbs         } : {}),
            ...(p.goals       ? { goals:   p.goals       } : {}),
            weeks: existing.weeks || [],
          };
        });
        return updated;
      });
    };
    loadAthleteProfiles();
  }, [user, role]);

  // Profile (loaded from DB on login — determines role)
  const [profile,       setProfile]       = useState(null);

  // Logs stored in Supabase — keyed by session_id
  const [logs,          setLogs]          = useState({});
  const [logsLoading,   setLogsLoading]   = useState(false);

  // Strava state
  const [stravaConnected,       setStravaConnected]       = useState(false);
  const [stravaActivities,      setStravaActivities]      = useState([]);
  const [stravaActivitiesLoading, setStravaActivitiesLoading] = useState(false);
  const [selectedStravaId,      setSelectedStravaId]      = useState(null);
  const [stravaDetail,          setStravaDetail]          = useState(null);
  const [stravaDetailLoading,   setStravaDetailLoading]   = useState(false);

  // Activities (manual logging + future Strava sync)
  const [activities,  setActivities]  = useState([]);
  const [logForm,     setLogForm]     = useState({ date: new Date().toISOString().split("T")[0], distanceKm: "", durationMin: "", type: "Run", notes: "" });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [logSaving,   setLogSaving]   = useState(false);
  const [logError,    setLogError]    = useState(null);

  // ── Auth: listen for session changes ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) resolveUser(session.user);
      else setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) resolveUser(session.user);
      else { setUser(null); setRole(null); setAuthLoading(false); }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const resolveUser = async (u) => {
    const email = u.email?.toLowerCase();
    setUser(u);
    let { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (!profileData) {
      const fullName = u.user_metadata?.full_name || email;
      const newProfile = {
        email,
        role: "athlete",
        name: fullName,
        avatar: fullName.slice(0, 2).toUpperCase(),
        goal: null,
        current_pb: null,
      };
      // Upsert protects against the brief race when onAuthStateChange fires twice
      // (e.g. token refresh) before the first insert lands.
      const { data: created } = await supabase
        .from("profiles")
        .upsert(newProfile, { onConflict: "email" })
        .select()
        .maybeSingle();
      profileData = created || newProfile;
    }
    setProfile(profileData);
    setRole(profileData?.role || "athlete");
    setAuthLoading(false);
  };

  // ── Capture Strava OAuth code before auth resolves ──
  // We set `strava_oauth_in_flight` right before redirecting to Strava so the
  // callback is unambiguous; falling back to the `scope` param check for older
  // tabs in case the flag isn't set.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("code");
    const scope = p.get("scope") ?? "";
    const inFlight = sessionStorage.getItem("strava_oauth_in_flight") === "1";
    const looksLikeStrava = inFlight || /\b(read|activity:read)\b/.test(scope);
    if (code && looksLikeStrava) {
      sessionStorage.removeItem("strava_oauth_in_flight");
      window.history.replaceState({}, "", window.location.pathname);
      sessionStorage.setItem("strava_pending_code", code);
    }
  }, []);

  // ── Load logs + Strava state when user + role are known ──
  useEffect(() => {
    if (!user || !role) return;
    Promise.all([loadLogs(), loadActivities()]);
    const pendingCode = sessionStorage.getItem("strava_pending_code");
    if (pendingCode) {
      sessionStorage.removeItem("strava_pending_code");
      exchangeStravaCode(pendingCode).then(d => {
        if (d?.success) setStravaConnected(true);
      }).catch(e => console.error("Strava exchange error", e));
    } else {
      checkStravaConnection();
    }
  }, [user, role]);

  // Default the coach week dropdown to the current week whenever they open
  // an athlete (or null when they leave the screen).
  useEffect(() => {
    if (role !== "coach" || coachScreen !== "athlete" || !dashAthlete) {
      if (coachWeekIdx !== null) setCoachWeekIdx(null);
      return;
    }
    const wks = athletePrograms[dashAthlete]?.weeks || [];
    if (wks.length === 0) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let idx = wks.findIndex(w => {
      const mon = new Date(w.weekStart + "T00:00:00");
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59, 999);
      return today >= mon && today <= sun;
    });
    if (idx < 0) {
      idx = wks.findIndex(w => new Date(w.weekStart + "T00:00:00") > today);
      if (idx < 0) idx = wks.length - 1;
    }
    setCoachWeekIdx(idx);
  }, [role, coachScreen, dashAthlete, athletePrograms]);

  // ── Refresh session log when coach opens a session detail ──
  // Single round-trip; no separate activities re-fetch (the home query already
  // pulls them, and clicking a row already re-renders against the latest state).
  useEffect(() => {
    if (role !== "coach" || coachScreen !== "session" || !activeSession?.id) return;
    let cancelled = false;
    supabase.from("session_logs").select("*")
      .eq("session_id", activeSession.id).maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setLogs(prev => ({ ...prev, [activeSession.id]: data }));
      })
      .catch(e => console.error("session log refresh error:", e));
    return () => { cancelled = true; };
  }, [coachScreen, activeSession?.id, role]);

  const loadLogs = async () => {
    setLogsLoading(true);
    const email = user.email?.toLowerCase();
    let q = supabase.from("session_logs").select("*");
    if (role === "athlete") q = q.eq("athlete_email", email);
    const { data, error } = await q;
    if (!error && data) {
      const map = {};
      data.forEach(row => { map[row.session_id] = row; });
      setLogs(map);
    }
    setLogsLoading(false);
  };

  const loadActivities = async () => {
    const email = user.email?.toLowerCase();
    let q = supabase.from("activities").select("*").order("activity_date", { ascending: false });
    if (role === "athlete") q = q.eq("athlete_email", email);
    const { data, error } = await q;
    if (!error && data) setActivities(data);
  };

  const saveActivity = async (form, stravaDetailData = null) => {
    setLogSaving(true);
    setLogError(null);
    const basePayload = {
      activity_date: form.date,
      distance_km: parseFloat(form.distanceKm),
      duration_seconds: form.durationMin ? Math.round(parseFloat(form.durationMin) * 60) : null,
      activity_type: form.type,
      notes: form.notes || null,
      ...(stravaDetailData ? { source: "strava", strava_data: stravaDetailData } : {}),
    };
    let data, error;
    if (editingActivityId) {
      ({ data, error } = await supabase.from("activities").update(basePayload).eq("id", editingActivityId).select().single());
    } else {
      ({ data, error } = await supabase.from("activities").insert({
        ...basePayload,
        athlete_email: user.email?.toLowerCase(),
        athlete_name: athleteData?.name || user.user_metadata?.full_name || user.email,
        source: stravaDetailData ? "strava" : "manual",
      }).select().single());
    }
    if (error) { console.error("saveActivity error:", error); setLogError(error.message); }
    if (!error && data) {
      setActivities(prev => editingActivityId ? prev.map(a => a.id === data.id ? data : a) : [data, ...prev]);
      // Auto-link to matching scheduled session for this date
      if (programEntry) {
        const allSessionsWithDate = programEntry.weeks.flatMap(w =>
          w.sessions.map(s => ({ ...s, weekStart: w.weekStart }))
        );
        const matchedSession = allSessionsWithDate.find(
          s => sessionDateStr(s.weekStart, s.day) === form.date
        );
        if (matchedSession && !logs[matchedSession.id]) {
          const TAG_EMOJI = { speed:"⚡", tempo:"🎯", easy:"🏃" };
          const autoAnalysis = {
            compliance: "completed",
            emoji: TAG_EMOJI[matchedSession.tag] || "🏃",
            distance_km: parseFloat(form.distanceKm),
            duration_min: form.durationMin ? parseFloat(form.durationMin) : null,
          };
          await saveLog(matchedSession.id, {
            analysis: autoAnalysis,
            ...(stravaDetailData ? { strava_data: stravaDetailData } : {}),
          });
        }
      }
      setLogForm({ date: new Date().toISOString().split("T")[0], distanceKm: "", durationMin: "", type: "Run", notes: "" });
      setEditingActivityId(null);
      clearStravaSelection();
      setStravaActivities([]);
      setScreen("home");
    }
    setLogSaving(false);
    return !error;
  };

  // Delete an activity row (extras and session-linked imports both live here).
  const deleteActivity = async (activityId) => {
    if (!activityId) return false;
    const { error } = await supabase.from("activities").delete().eq("id", activityId);
    if (error) { console.error("deleteActivity error:", error); return false; }
    setActivities(prev => prev.filter(a => a.id !== activityId));
    return true;
  };

  // Wipe a session log + any activity that was created when it was submitted.
  const deleteSessionLog = async (sessionId, linkedActivityId) => {
    if (linkedActivityId) await deleteActivity(linkedActivityId);
    const { error } = await supabase.from("session_logs").delete().eq("session_id", sessionId);
    if (error) { console.error("deleteSessionLog error:", error); return false; }
    setLogs(prev => { const next = { ...prev }; delete next[sessionId]; return next; });
    return true;
  };

  const saveLog = async (sessionId, updates) => {
    const existing = logs[sessionId];
    let data, error;
    if (existing?.id) {
      // Row exists — update only the changed fields
      ({ data, error } = await supabase
        .from("session_logs")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single());
    } else {
      // No row yet — insert (upsert in case of race condition)
      ({ data, error } = await supabase
        .from("session_logs")
        .upsert({
          session_id: sessionId,
          athlete_email: user.email?.toLowerCase(),
          athlete_name: athleteData?.name || user.user_metadata?.full_name || user.email,
          ...updates,
          updated_at: new Date().toISOString(),
        }, { onConflict: "session_id" })
        .select()
        .single());
    }
    if (error) {
      console.error("saveLog error:", error);
      throw error;
    }
    if (data) setLogs(prev => ({ ...prev, [sessionId]: data }));
  };

  // ── Sign in with Google ──
  const signInWithGoogle = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setRole(null); setProfile(null);
    setLogs({}); setActivities([]); setAthletePrograms({});
    setStravaConnected(false); setStravaActivities([]);
    setSelectedStravaId(null); setStravaDetail(null);
    setActiveSession(null); setActiveExtraActivity(null);
    setActiveWeekIdx(null); setCoachWeekIdx(null); setHoveredWeekIdx(null);
    setCoachReply(""); setFeedbackText("");
    setSessionDistKm(""); setSessionDurMin(""); setSessionDateOverride(null);
    setScreen("home"); setCoachScreen("dashboard");
    setDashAthlete(null);
  };

  const checkStravaConnection = async () => {
    try {
      const d = await stravaCall("check");
      setStravaConnected(d.connected === true);
    } catch { setStravaConnected(false); }
  };

  // Auto-fetch recent Strava activities for the rolling volume graph
  useEffect(() => {
    if (stravaConnected) fetchStravaActivities();
  }, [stravaConnected]);

  const connectStrava = () => {
    const redirectUri = encodeURIComponent(window.location.origin);
    const scope = "read,activity:read";
    sessionStorage.setItem("strava_oauth_in_flight", "1");
    window.location.href = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=${scope}`;
  };

  // Dismiss the bar-chart hover/tap tooltip when the user taps anywhere
  // outside a bar (otherwise the tooltip "sticks" on touch devices).
  useEffect(() => {
    if (hoveredWeekIdx === null) return;
    const dismiss = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-bar-chart="1"]')) return;
      setHoveredWeekIdx(null);
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("touchstart", dismiss, { passive: true });
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("touchstart", dismiss);
    };
  }, [hoveredWeekIdx]);

  const fetchStravaActivities = async () => {
    if (stravaActivitiesLoading) return;
    setStravaActivitiesLoading(true);
    try {
      const data = await stravaCall("list", { per_page: 50 });
      if (Array.isArray(data)) {
        setStravaActivities(data.filter(a => a.sport_type === "Run" || a.type === "Run"));
      }
    } catch(e) { console.error("strava list error", e); }
    setStravaActivitiesLoading(false);
  };

  const fetchStravaDetail = async (id) => {
    setStravaDetailLoading(true);
    setStravaDetail(null);
    try {
      const data = await stravaCall("get", { activity_id: id });
      if (data?.id) {
        const extracted = extractStravaData(data);
        setStravaDetail(extracted);
        setStravaDetailLoading(false);
        return extracted;
      }
    } catch(e) { console.error("strava get error", e); }
    setStravaDetailLoading(false);
    return null;
  };

  const clearStravaSelection = () => {
    setSelectedStravaId(null);
    setStravaDetail(null);
  };

  // ── Resolve athlete program ──
  // Profile is the source of truth for identity; coach_plans provides weeks.
  const athleteEmail = user?.email?.toLowerCase();
  const programEntry = athletePrograms[athleteEmail] || null;
  const athleteData  = profile ? {
    name:    profile.name,
    goal:    profile.goal,
    current: profile.current_pb,
    avatar:  profile.avatar,
    weeks:   programEntry?.weeks || [],
  } : null;
  const weeks       = athleteData?.weeks || [];
  const allSessions = useMemo(() => weeks.flatMap(w => w.sessions), [weeks]);

  // Drag sensors: small distance threshold so taps still register as clicks.
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
  );

  // Persist a session's actual_date when dragged to a new day in the same week.
  const handleSessionDrop = async (sessionId, newDate, weekStart) => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    const session = (weeks.find(w => w.weekStart === weekStart)?.sessions || []).find(s => s.id === sessionId);
    if (!session) return;
    const scheduledDate = sessionDateStr(weekStart, session.day);
    const existing = logs[sessionId];
    const existingAnalysis = existing?.analysis || {};
    const nextAnalysis = { ...existingAnalysis };
    if (newDate === scheduledDate) delete nextAnalysis.actual_date;
    else nextAnalysis.actual_date = newDate;
    try { await saveLog(sessionId, { analysis: nextAnalysis }); }
    catch (e) { console.error("drag-move saveLog error:", e); }
  };

  // Default the athlete week to the current week (Monday of today) on first mount.
  useEffect(() => {
    if (role !== "athlete" || activeMonday !== null) return;
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const dow = t.getDay();              // 0 = Sun, 1 = Mon, ... 6 = Sat
    const offset = dow === 0 ? -6 : 1 - dow;
    t.setDate(t.getDate() + offset);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, "0");
    const d = String(t.getDate()).padStart(2, "0");
    setActiveMonday(`${y}-${m}-${d}`);
  }, [role, activeMonday]);

  // Index activities by athlete + date for O(1) lookups in render loops.
  const actByEmailDate = useMemo(() => {
    const m = new Map();
    for (const a of activities) {
      const key = `${a.athlete_email}|${a.activity_date}`;
      if (!m.has(key)) m.set(key, a);
    }
    return m;
  }, [activities]);
  const findAthAct = (email, date) => actByEmailDate.get(`${email?.toLowerCase()}|${date}`);

  const handleSubmitFeedback = async () => {
    if (!sessionDistKm || !activeSession) return;
    setIsSaving(true);
    const s = activeSession;
    try {
      const TAG_EMOJI = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
      const scheduledDate = s.weekStart ? sessionDateStr(s.weekStart, s.day) : null;
      const sessionDate = sessionDateOverride || scheduledDate
        || (() => { const d = new Date(); const y = d.getFullYear(); const mo = String(d.getMonth()+1).padStart(2,"0"); const dy = String(d.getDate()).padStart(2,"0"); return `${y}-${mo}-${dy}`; })();
      const analysis = {
        compliance: "completed",
        emoji: TAG_EMOJI[s.tag] || "🏃",
        distance_km: parseFloat(sessionDistKm),
        duration_min: sessionDurMin ? parseFloat(sessionDurMin) : null,
        ...(sessionDate !== scheduledDate ? { actual_date: sessionDate } : {}),
      };
      await saveLog(s.id, { feedback: feedbackText, analysis, ...(stravaDetail ? { strava_data: stravaDetail } : {}) });

      // Save to activities so distance counts toward weekly total.
      // Check the overridden date first, then the scheduled date, then the
      // previously-saved actual_date so re-edits find the right row.
      const prevActualDate = logs[s.id]?.analysis?.actual_date;
      const existing = findAthAct(user.email, sessionDate)
        || findAthAct(user.email, scheduledDate)
        || (prevActualDate ? findAthAct(user.email, prevActualDate) : null);
      if (!existing) {
        const payload = {
          athlete_email: user.email?.toLowerCase(),
          athlete_name: athleteData?.name || user.email,
          activity_date: sessionDate,
          distance_km: parseFloat(sessionDistKm),
          duration_seconds: sessionDurMin ? Math.round(parseFloat(sessionDurMin) * 60) : null,
          activity_type: s.type || "Run",
          notes: feedbackText || null,
          source: "session",
          ...(stravaDetail ? { strava_data: stravaDetail } : {}),
        };
        const { data: actData } = await supabase.from("activities").insert(payload).select().single();
        if (actData) setActivities(prev => [actData, ...prev]);
      } else {
        const { data: updAct } = await supabase.from("activities").update({
          activity_date: sessionDate,
          distance_km: parseFloat(sessionDistKm),
          duration_seconds: sessionDurMin ? Math.round(parseFloat(sessionDurMin) * 60) : null,
          notes: feedbackText || null,
          source: stravaDetail ? "strava" : "session",
          strava_data: stravaDetail || null,
        }).eq("id", existing.id).select().single();
        if (updAct) setActivities(prev => prev.map(a => a.id === updAct.id ? updAct : a));
      }

      setSessionDistKm("");
      setSessionDurMin("");
      clearStravaSelection();
      setScreen("result");
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  // ── Profile editor ──
  // Populate the form whenever an athlete or coach enters the profile screen.
  // Pre-fill from the JSONB pbs/goals if present; falls back to empty fields
  // when the athlete hasn't migrated to the structured format yet.
  useEffect(() => {
    if (role === "athlete" && screen === "profile" && profile) {
      setProfileForm({
        name: profile.name || "",
        avatar: profile.avatar || "",
        pbs:   { ...EMPTY_PB_GOAL, ...(profile.pbs   || {}) },
        goals: { ...EMPTY_PB_GOAL, ...(profile.goals || {}) },
      });
      setProfileStatus(null);
    }
  }, [role, screen, profile]);

  useEffect(() => {
    if (role === "coach" && coachScreen === "profile" && dashAthlete) {
      const ap = athletePrograms[dashAthlete] || {};
      setProfileForm({
        name: ap.name || "",
        avatar: ap.avatar || "",
        pbs:   { ...EMPTY_PB_GOAL, ...(ap.pbs   || {}) },
        goals: { ...EMPTY_PB_GOAL, ...(ap.goals || {}) },
      });
      setProfileStatus(null);
    }
  }, [role, coachScreen, dashAthlete, athletePrograms]);

  const handleSaveProfile = async (targetEmail) => {
    if (!targetEmail) return;
    setProfileSaving(true);
    setProfileStatus(null);
    try {
      const key = targetEmail.toLowerCase();
      const cleanedPbs   = cleanPbGoal(profileForm.pbs);
      const cleanedGoals = cleanPbGoal(profileForm.goals);
      const payload = {
        email: key,
        name: profileForm.name.trim() || null,
        avatar: profileForm.avatar.trim() || null,
        pbs:   cleanedPbs,
        goals: cleanedGoals,
        // Keep legacy text columns in sync for screens that still read them.
        current_pb: fmtPbGoal(cleanedPbs),
        goal:       fmtPbGoal(cleanedGoals),
        role: "athlete",
      };
      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "email" })
        .select()
        .single();
      if (error) throw error;
      if (role === "athlete" && key === user.email?.toLowerCase()) {
        setProfile(data);
      }
      setAthletePrograms(prev => {
        const existing = prev[key] || {};
        return {
          ...prev,
          [key]: {
            ...existing,
            name:    data.name       || existing.name,
            goal:    data.goal       || existing.goal,
            current: data.current_pb || existing.current,
            avatar:  data.avatar     || existing.avatar,
            pbs:     data.pbs        ?? existing.pbs,
            goals:   data.goals      ?? existing.goals,
            weeks:   existing.weeks  || [],
          },
        };
      });
      setProfileStatus({ kind: "success", message: "Profile saved." });
      setTimeout(() => {
        if (role === "athlete") setScreen("home");
        else setCoachScreen("athlete");
      }, 600);
    } catch (e) {
      setProfileStatus({ kind: "error", message: e.message || "Save failed." });
    }
    setProfileSaving(false);
  };

  // ── Coach reply ──
  const handleCoachReply = async (sessionId) => {
    if (!coachReply.trim()) return;
    try {
      await saveLog(sessionId, { coach_reply: coachReply });
      setCoachReply("");
    } catch(e) { console.error("coach reply save error:", e); }
  };

  // ── Compliance stats (memoised per athlete) ──
  // Pre-bucket activities by email so each athlete card avoids a full O(N) filter.
  const activitiesByEmail = useMemo(() => {
    const m = new Map();
    for (const a of activities) {
      const k = a.athlete_email;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return m;
  }, [activities]);

  const statsCache = useMemo(() => {
    const m = new Map();
    for (const [email, prog] of Object.entries(athletePrograms)) {
      const acts = activitiesByEmail.get(email) || [];
      m.set(email, getStats(prog, acts, logs, email));
    }
    return m;
  }, [athletePrograms, activitiesByEmail, logs]);

  const statsFor = (email) => statsCache.get(email) || { total: 0, done: 0, missed: 0, partial: 0, rate: 0 };

  // ────────────────────────────────────────────────────────────
  //  LOADING
  // ────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:16 }}>⏳</div>
        <div style={{ color:C.mid, fontSize:14 }}>Loading...</div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  LOGIN SCREEN
  // ────────────────────────────────────────────────────────────
  if (!user) return (
    <div style={S.page}>
      <div style={S.grain}/>
      <div style={{ maxWidth:400, margin:"0 auto", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ fontSize:11, letterSpacing:5, color:C.crimson, textTransform:"uppercase", marginBottom:16, fontFamily:S.bodyFont }}>Training Platform</div>
        <div style={{ borderTop:`1px solid ${C.rule}`, width:48, margin:"0 auto 24px" }}/>
        <div style={{ fontSize:48, fontWeight:900, fontFamily:S.displayFont, lineHeight:1.0, marginBottom:6, color:C.navy }}>Form</div>
        <div style={{ fontSize:14, color:C.mid, fontFamily:S.bodyFont, letterSpacing:4, textTransform:"uppercase", marginBottom:6 }}>&amp;</div>
        <div style={{ fontSize:48, fontWeight:900, fontFamily:S.displayFont, lineHeight:1.0, marginBottom:24, color:C.navy }}>Pace</div>
        <div style={{ borderBottom:`1px solid ${C.rule}`, width:48, margin:"0 auto 32px" }}/>
        <div style={{ fontSize:14, color:C.mid, marginBottom:56, lineHeight:1.6, fontFamily:S.bodyFont }}>
          Expert coaching for<br/>distance runners
        </div>

        <button onClick={signInWithGoogle} style={{
          background:C.navy, color:C.cream, border:"none", borderRadius:2,
          padding:"16px 28px", fontSize:13, fontWeight:600, cursor:"pointer",
          display:"flex", alignItems:"center", gap:12, margin:"0 auto",
          letterSpacing:2, textTransform:"uppercase", fontFamily:S.bodyFont,
        }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        {authError && (
          <div style={{ marginTop:20, color:C.crimson, fontSize:13 }}>{authError}</div>
        )}

        <div style={{ marginTop:48, fontSize:12, color:C.mid, lineHeight:1.8, fontFamily:S.bodyFont }}>
          Athletes are automatically linked to their program.<br/>
          Coaches see all athletes and session data.
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  ATHLETE NOT FOUND
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && !athleteData) return (
    <div style={S.page}>
      <div style={S.grain}/>
      <div style={{ maxWidth:400, margin:"0 auto", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:20 }}>👋</div>
        <div style={{ fontSize:20, fontWeight:700, marginBottom:12, fontFamily:S.displayFont, color:C.navy }}>You're not enrolled yet</div>
        <div style={{ fontSize:14, color:C.mid, lineHeight:1.8, marginBottom:32, fontFamily:S.bodyFont }}>
          Your coach needs to add you to the platform.<br/>
          Share your email with them:<br/>
          <span style={{ color:C.crimson, fontFamily:S.monoFont, fontSize:13, marginTop:8, display:"block" }}>{user.email}</span>
        </div>
        <button onClick={signOut} style={S.ghostBtn}>Sign out</button>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  COACH DASHBOARD
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "dashboard") {
    const athletes = Object.entries(athletePrograms);
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title="Coach Dashboard"
          subtitle={user.user_metadata?.full_name || user.email}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>

          {/* Summary */}
          <div style={{ display:"flex", gap:10, marginBottom:28 }}>
            {[
              { label:"Athletes",    val: athletes.length },
              { label:"Logs Today",  val: Object.values(logs).filter(l => l.updated_at?.startsWith(new Date().toISOString().split("T")[0])).length },
              { label:"Avg Compliance", val: athletes.length ? Math.round(athletes.reduce((a,[e])=>a+statsFor(e).rate,0)/athletes.length)+"%" : "–" },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:24, fontWeight:900, color:C.navy }}>{s.val}</div>
                <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Plan Builder button */}
          <button
            onClick={() => setCoachScreen("plan-builder")}
            style={{ ...S.signOutBtn, width:"100%", marginBottom:20, padding:"12px", fontSize:14, fontWeight:700, background:"#1a2744", color:"#e8dcc8", border:"1px solid #2a3a5c", borderRadius:8 }}
          >
            ✏️ Plan Builder
          </button>

          {/* Athlete cards */}
          {athletes.map(([email, data]) => {
            const st = statsFor(email);
            const weeksList = Array.isArray(data.weeks) ? data.weeks : [];
            const recentSessions = weeksList.flatMap(w=>w.sessions || []).filter(s=>logs[s.id]).slice(-3);
            const thisWeekKm = weekKm(activities, email, 0);
            const displayName = data.name || prettyEmailName(email);
            const avatar = data.avatar || displayName.slice(0, 2).toUpperCase();
            return (
              <div key={email} onClick={()=>{ setDashAthlete(email); setCoachScreen("athlete"); }}
                style={{ ...S.card, marginBottom:12, cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                  <div style={{ width:46, height:46, borderRadius:"50%", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:14, flexShrink:0, color:C.cream }}>
                    {avatar}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:16, color:C.navy, fontFamily:S.displayFont }}>{displayName}</div>
                    <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>Goal: {fmtPbGoal(data.goals) || data.goal || "—"} · PB: {fmtPbGoal(data.pbs) || data.current || "—"}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:C.navy }}>{thisWeekKm.toFixed(1)}</div>
                    <div style={{ fontSize:9, color:C.mid, letterSpacing:1, textTransform:"uppercase" }}>km/wk</div>
                  </div>
                  <div style={{ color:C.mid, fontSize:20 }}>›</div>
                </div>
                <div style={{ background:C.lightRule, borderRadius:2, height:5, marginBottom:8 }}>
                  <div style={{ width:`${st.rate}%`, height:5, borderRadius:2, background: st.rate>75?C.green:st.rate>40?C.amber:C.crimson, transition:"width 0.5s" }}/>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:C.mid }}>
                  <span>{st.done}/{st.total} sessions · {st.rate}% compliance</span>
                  {st.missed > 0 && <span style={{ color:C.crimson }}>{st.missed} missed</span>}
                </div>
                {recentSessions.length > 0 && (
                  <div style={{ marginTop:10, display:"flex", gap:6, alignItems:"center" }}>
                    {recentSessions.map(s=>(
                      <span key={s.id} style={{ background:C.lightRule, borderRadius:2, padding:"3px 8px", fontSize:16 }}>
                        {logs[s.id]?.analysis?.emoji || "📝"}
                      </span>
                    ))}
                    <span style={{ fontSize:11, color:C.mid, marginLeft:2 }}>recent</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → PLAN BUILDER
  // ────────────────────────────────────────────────────────────
  // Throws on error so the Plan Builder's inline banner can surface the message.
  const handleSavePlan = async (athleteEmail, weeksArray, meta = {}) => {
    const key = athleteEmail?.toLowerCase();

    // Refuse to overwrite a non-empty stored plan with an empty weeks array.
    // Guards against a race where Plan Builder mounts before athletePrograms
    // hydrates, plus silently-failing Excel imports in replace mode.
    if (!weeksArray || weeksArray.length === 0) {
      const { data: existing } = await supabase
        .from('coach_plans')
        .select('plan_json')
        .eq('athlete_email', key)
        .maybeSingle();
      const pj = existing?.plan_json;
      const existingWeeks = Array.isArray(pj) ? pj : (pj?.weeks || []);
      if (existingWeeks.length > 0) {
        throw new Error('Refusing to save: existing plan has ' + existingWeeks.length + ' week(s) but the form is empty. Reload the athlete or import a plan first.');
      }
    }

    const planJson = {
      athleteName: meta.name?.trim() || null,
      athleteGoal: meta.goal?.trim() || null,
      athletePb:   meta.current?.trim() || null,
      weeks: weeksArray,
    };
    const { error } = await supabase.from('coach_plans').upsert({
      athlete_email: key,
      plan_json: planJson,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_email' });
    if (error) throw error;
    setAthletePrograms(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...(planJson.athleteName ? { name:    planJson.athleteName } : {}),
        ...(planJson.athleteGoal ? { goal:    planJson.athleteGoal } : {}),
        ...(planJson.athletePb   ? { current: planJson.athletePb   } : {}),
        weeks: weeksArray,
      },
    }));
  };

  if (role === "coach" && coachScreen === "plan-builder") {
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title="Plan Builder"
          subtitle="Edit athlete training plans"
          right={<button onClick={() => setCoachScreen("dashboard")} style={S.signOutBtn}>← Back</button>}
        />
        <CoachPlanBuilder athletes={athletePrograms} onSave={handleSavePlan} />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → EDIT ATHLETE PROFILE
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "profile" && dashAthlete) {
    const ap = athletePrograms[dashAthlete] || {};
    const targetName = ap.name || prettyEmailName(dashAthlete);
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={`Edit ${targetName}`} subtitle={dashAthlete} onBack={() => setCoachScreen("athlete")} />
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 80px" }}>
          <ProfileForm form={profileForm} setForm={setProfileForm} email={dashAthlete} />
          {profileStatus && (
            <div style={{ marginBottom: 12, padding: "10px 12px", fontSize: 13, borderRadius: 2,
              background: profileStatus.kind === "error" ? "#fdf0f0" : "#eef6ec",
              color:      profileStatus.kind === "error" ? C.crimson : C.green,
              border: `1px solid ${profileStatus.kind === "error" ? C.crimson : C.green}` }}>
              {profileStatus.message}
            </div>
          )}
          <button onClick={() => handleSaveProfile(dashAthlete)} disabled={profileSaving}
            style={S.primaryBtn(C.crimson, profileSaving)}>
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → ATHLETE DETAIL
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "athlete" && dashAthlete) {
    const da  = athletePrograms[dashAthlete] || { weeks: [] };
    const st  = statsFor(dashAthlete);
    const athWeekKm = weekKm(activities, dashAthlete, 0);
    const daName = da.name || prettyEmailName(dashAthlete);
    const daGoal = da.goal || "—";
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={daName} subtitle={`Goal: ${daGoal}`} onBack={()=>setCoachScreen("dashboard")}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>

          <div style={{ display:"flex", gap:10, marginBottom:24 }}>
            {[
              { label:"Compliance", val:`${st.rate}%`, color: st.rate>75?C.green:st.rate>40?C.amber:C.crimson },
              { label:"Completed",  val: st.done,   color:C.green },
              { label:"Missed",     val: st.missed,  color: st.missed>0?C.crimson:C.mid },
              { label:"Km This Wk", val:`${athWeekKm.toFixed(1)}`, color:C.navy },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:24, fontWeight:900, color:s.color||C.navy }}>{s.val}</div>
                <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <button onClick={() => setCoachScreen("profile")}
            style={{ ...S.signOutBtn, width:"100%", marginBottom:20, padding:"10px", fontSize:13, fontWeight:600 }}>
            ✏️ Edit Profile (name, goal, PB)
          </button>

          {da.weeks.length === 0 && (() => {
            const athActs = activitiesByEmail.get(dashAthlete?.toLowerCase()) || [];
            if (athActs.length === 0) {
              return <div style={{ textAlign:"center", padding:"40px 0", color:C.mid, fontSize:14 }}>No activities or training plan yet.</div>;
            }
            return (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:8, fontFamily:S.bodyFont }}>All Activities</div>
                {athActs.map(act => (
                  <div key={act.id} onClick={()=>{ setActiveExtraActivity(act); setCoachScreen("extra-activity"); }} style={{ ...S.card, marginBottom:8, display:"flex", alignItems:"center", gap:12, background:"#fdf0f0", border:`1px solid ${C.rule}`, borderLeft:`3px solid ${C.crimson}`, cursor:"pointer" }}>
                    <div style={{ fontSize:22 }}>🏃</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>{act.activity_date} · {act.activity_type || "Run"}</div>
                        <div style={{ fontSize:11, color:C.mid, fontWeight:700 }}>{(act.source || "manual").toUpperCase()}</div>
                      </div>
                      <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>
                        {act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds/60)}min` : ""}
                        {act.notes ? ` — ${act.notes}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          {da.weeks.length > 0 && coachWeekIdx !== null && (() => {
            const athActs     = activitiesByEmail.get(dashAthlete?.toLowerCase()) || [];
            const athActDates = new Set(athActs.map(a => a.activity_date));
            const today = new Date(); today.setHours(0,0,0,0);
            const weekStatus = (w) => {
              const mon = new Date(w.weekStart + "T00:00:00");
              const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59,999);
              if (today > sun) return "past";
              if (today >= mon) return "current";
              return "future";
            };
            const idx = Math.min(coachWeekIdx, da.weeks.length - 1);
            const wk = da.weeks[idx];
            const status = weekStatus(wk);
            const isCurrent = status === "current";
            const wkEnd = weekEndStr(wk.weekStart);
            const extraActs = athActs.filter(a => a.source !== "session" && a.activity_date >= wk.weekStart && a.activity_date <= wkEnd);
            return (
              <>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:6, fontFamily:S.bodyFont }}>Week</div>
                  <div style={{ position:"relative" }}>
                    <select
                      value={idx}
                      onChange={(e) => setCoachWeekIdx(Number(e.target.value))}
                      style={{
                        width:"100%",
                        appearance:"none",
                        WebkitAppearance:"none",
                        background: isCurrent ? C.crimson : C.white,
                        color: isCurrent ? "#fffdf8" : C.navy,
                        border:`1px solid ${isCurrent ? "#E06666" : C.rule}`,
                        borderRadius:2,
                        padding:"12px 36px 12px 14px",
                        fontSize:13,
                        fontWeight:700,
                        letterSpacing:0.5,
                        fontFamily:S.bodyFont,
                        cursor:"pointer",
                      }}>
                      {da.weeks.map((w, i) => {
                        const s = weekStatus(w);
                        const tag = s === "current" ? " · THIS WEEK" : s === "past" ? " · PAST" : "";
                        return <option key={i} value={i}>{w.weekLabel}{tag}</option>;
                      })}
                    </select>
                    <div style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none", color: isCurrent ? "rgba(255,255,255,0.75)" : C.mid, fontSize:14 }}>▾</div>
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  {wk.sessions.map(s => {
                    const log    = logs[s.id];
                    const sDate  = sessionDateStr(wk.weekStart, s.day);
                    const comply = log?.analysis?.compliance || (athActDates.has(sDate) ? "completed" : "pending");
                    return (
                      <div key={s.id}
                        onClick={()=>{
                          const sess = {...s, weekStart: wk.weekStart, athleteEmail: dashAthlete};
                          setActiveSession(sess);
                          setCoachScreen("session");
                        }}
                        style={{ ...S.card, marginBottom:8, cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ fontSize:22 }}>{log?.analysis?.emoji || "⏳"}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div style={{ fontWeight:700, fontSize:14 }}>{s.day} · {s.type}</div>
                            <div style={{ fontSize:11, color: COMPLY_COLOR[comply], fontWeight:700 }}>{COMPLY_LABEL[comply]}</div>
                          </div>
                          {log?.analysis?.distance_km && (
                            <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>{log.analysis.distance_km}km{log.analysis.duration_min ? ` · ${log.analysis.duration_min}min` : ""}</div>
                          )}
                          {log?.coach_reply && <div style={{ fontSize:11, color:"#14365f", marginTop:3 }}>💬 You replied</div>}
                        </div>
                        <div style={{ color:C.mid }}>›</div>
                      </div>
                    );
                  })}
                  {extraActs.map(act => (
                    <div key={act.id} onClick={()=>{ setActiveExtraActivity(act); setCoachScreen("extra-activity"); }} style={{ ...S.card, marginBottom:8, display:"flex", alignItems:"center", gap:12, background:"#fdf0f0", border:`1px solid ${C.rule}`, borderLeft:`3px solid ${C.crimson}`, cursor:"pointer" }}>
                      <div style={{ fontSize:22 }}>➕</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>{act.activity_date.slice(5).replace("-"," ")} · Extra Run</div>
                          <div style={{ fontSize:11, color:C.mid, fontWeight:700 }}>EXTRA</div>
                        </div>
                        <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>
                          {act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds/60)}min` : ""}
                          {act.notes ? ` — ${act.notes}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → SESSION DETAIL
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "session" && activeSession) {
    const log = logs[activeSession.id];
    const an  = log?.analysis;
    const coachSDate = activeSession.weekStart ? sessionDateStr(activeSession.weekStart, activeSession.day) : null;
    const linkedAthAct = coachSDate ? findAthAct(activeSession.athleteEmail, coachSDate) : null;
    const sessionLogged = !!log || !!linkedAthAct;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>setCoachScreen("athlete")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>

          <SectionCard label="Prescribed Session">
            {activeSession.desc.split("\n").map((l,i)=>(
              <div key={i} style={{ fontSize:14, color:i===0?C.navy:C.mid, lineHeight:1.9 }}>{l}</div>
            ))}
            <div style={{ display:"flex", gap:20, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.lightRule}` }}>
              <MiniStat label="Terrain" val={activeSession.terrain}/>
              <MiniStat label="Target Pace" val={activeSession.pace} color={C.crimson}/>
            </div>
          </SectionCard>

          {!sessionLogged ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.mid, fontSize:14 }}>Athlete hasn't logged this session yet.</div>
          ) : (
            <>
              {(() => {
                const distKm   = an?.distance_km ?? linkedAthAct?.distance_km;
                const durSecs  = linkedAthAct?.duration_seconds;
                const durMin   = an?.duration_min ?? (durSecs ? Math.round(durSecs / 60) : null);
                const notes    = log?.feedback || linkedAthAct?.notes;
                return (<>
                  <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                    {distKm  && <StatPill label="Distance" val={`${distKm}km`}  color={C.green}/>}
                    {durMin  && <StatPill label="Duration" val={`${durMin}min`}/>}
                  </div>
                  {(log?.strava_data || linkedAthAct?.strava_data) && <StravaCard data={log?.strava_data || linkedAthAct?.strava_data}/>}
                  {notes ? (
                    <SectionCard label="Athlete's Notes">
                      <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, fontStyle:"italic" }}>"{notes}"</div>
                    </SectionCard>
                  ) : (
                    <div style={{ fontSize:13, color:C.mid, textAlign:"center", padding:"8px 0 16px" }}>No notes submitted.</div>
                  )}
                </>);
              })()}

              {/* Compliance override — coach can mark the session done / partial / missed. */}
              <SectionCard label="Compliance">
                <div style={{ display:"flex", gap:6 }}>
                  {[
                    { val:"completed", label:"✓ Done",    color:C.green   },
                    { val:"partial",   label:"~ Partial", color:C.amber   },
                    { val:"missed",    label:"✗ Missed",  color:C.crimson },
                  ].map(opt => {
                    const current = an?.compliance || (linkedAthAct ? "completed" : "pending");
                    const active  = current === opt.val;
                    return (
                      <button key={opt.val} type="button"
                        onClick={async () => {
                          const nextAnalysis = {
                            ...(an || {}),
                            compliance: opt.val,
                            emoji: opt.val === "missed" ? "✗" : (an?.emoji || TAG_EMOJI[activeSession.tag] || "🏃"),
                          };
                          try {
                            await saveLog(activeSession.id, { analysis: nextAnalysis });
                          } catch (e) { console.error("compliance save failed", e); }
                        }}
                        style={{
                          flex:1, padding:"8px 10px", borderRadius:2, fontSize:12,
                          background: active ? opt.color : C.white,
                          color:      active ? "#fffdf8" : opt.color,
                          border:    `1px solid ${opt.color}`,
                          cursor:"pointer", letterSpacing:0.5, fontWeight:600,
                        }}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard label="💬 Your Reply">
                {(log?.coach_reply || linkedAthAct?.coach_reply) ? (
                  <>
                    <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, marginBottom:12 }}>{log?.coach_reply || linkedAthAct?.coach_reply}</div>
                    <button onClick={async ()=>{
                      if (log?.coach_reply) {
                        const { data: updated } = await supabase.from("session_logs").update({ coach_reply: "", updated_at: new Date().toISOString() }).eq("session_id", activeSession.id).select().maybeSingle();
                        if (updated) setLogs(prev => ({ ...prev, [activeSession.id]: updated }));
                      } else if (linkedAthAct) {
                        const { data: actUpd } = await supabase.from("activities").update({ coach_reply: "" }).eq("id", linkedAthAct.id).select().maybeSingle();
                        if (actUpd) setActivities(prev => prev.map(a => a.id === actUpd.id ? actUpd : a));
                      }
                    }} style={S.ghostBtn}>Edit reply</button>
                  </>
                ) : (
                  <>
                    <textarea value={coachReply} onChange={e=>setCoachReply(e.target.value)}
                      placeholder="Write a note back to the athlete..."
                      style={{ ...S.textarea, minHeight:90 }}/>
                    <button onClick={async ()=>{
                      if (!coachReply.trim()) return;
                      const ts = new Date().toISOString();
                      // Try updating session_log first (handles sessions logged via session screen)
                      const { data: updated, error: updateErr } = await supabase
                        .from("session_logs")
                        .update({ coach_reply: coachReply, updated_at: ts })
                        .eq("session_id", activeSession.id)
                        .select().maybeSingle();
                      if (updated) {
                        setLogs(prev => ({ ...prev, [activeSession.id]: updated }));
                        setCoachReply("");
                        return;
                      }
                      if (updateErr) {
                        alert("UPDATE error: " + updateErr.message);
                        return;
                      }
                      // No session_log row — fall back to updating the linked activity
                      if (linkedAthAct) {
                        const { data: actUpd, error: actErr } = await supabase
                          .from("activities")
                          .update({ coach_reply: coachReply })
                          .eq("id", linkedAthAct.id)
                          .select().maybeSingle();
                        if (actUpd) {
                          setActivities(prev => prev.map(a => a.id === actUpd.id ? actUpd : a));
                          setCoachReply("");
                          return;
                        }
                        alert("Activity update error: " + (actErr?.message || "no row returned"));
                        return;
                      }
                      alert("No session log or activity found for this session.");
                    }} disabled={!coachReply.trim()} style={S.primaryBtn("#14365f", !coachReply.trim())}>
                      Send Reply →
                    </button>
                  </>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH — EXTRA ACTIVITY DETAIL
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "extra-activity" && activeExtraActivity) {
    const act = activeExtraActivity;
    const durMin = act.duration_seconds ? Math.round(act.duration_seconds / 60) : null;
    const dateLabel = act.activity_date ? act.activity_date.slice(5).replace("-", " ") : "";
    const da = athletePrograms[dashAthlete];
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={act.activity_type || "Run"} subtitle={dateLabel} onBack={()=>{ setActiveExtraActivity(null); setCoachScreen("athlete"); }}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}>
          <div style={{ fontSize:13, color:C.mid, marginBottom:16 }}>{da?.name}</div>
          <div style={{ textAlign:"center", fontSize:48, margin:"20px 0 8px" }}>➕</div>
          <div style={{ textAlign:"center", fontSize:14, color:C.crimson, fontWeight:700, marginBottom:20, letterSpacing:1 }}>EXTRA RUN</div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {act.distance_km && <StatPill label="Distance" val={`${act.distance_km}km`} color={C.green}/>}
            {durMin && <StatPill label="Duration" val={`${durMin}min`}/>}
          </div>
          {act.strava_data && <StravaCard data={act.strava_data}/>}
          {act.notes && (
            <SectionCard label="Athlete Notes">
              <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, fontStyle:"italic" }}>"{act.notes}"</div>
            </SectionCard>
          )}
          <SectionCard label="💬 Your Reply">
            {act.coach_reply ? (
              <>
                <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, marginBottom:12 }}>{act.coach_reply}</div>
                <button onClick={async ()=>{
                  const { data } = await supabase.from("activities").update({ coach_reply: "" }).eq("id", act.id).select().single();
                  if (data) { setActiveExtraActivity(data); setActivities(prev => prev.map(a => a.id === data.id ? data : a)); }
                }} style={S.ghostBtn}>Edit reply</button>
              </>
            ) : (
              <>
                <textarea value={coachReply} onChange={e=>setCoachReply(e.target.value)}
                  placeholder="Write a note back to the athlete..."
                  style={{ ...S.textarea, minHeight:90 }}/>
                <button onClick={async ()=>{
                  if (!coachReply.trim()) return;
                  const { data } = await supabase.from("activities").update({ coach_reply: coachReply }).eq("id", act.id).select().single();
                  if (data) { setActiveExtraActivity(data); setActivities(prev => prev.map(a => a.id === data.id ? data : a)); setCoachReply(""); }
                }} disabled={!coachReply.trim()} style={S.primaryBtn("#14365f", !coachReply.trim())}>
                  Send Reply →
                </button>
              </>
            )}
          </SectionCard>
          <button onClick={()=>{ setActiveExtraActivity(null); setCoachScreen("athlete"); }} style={S.ghostBtn}>← Back to athlete</button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — PROFILE
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "profile") {
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title="My Profile" subtitle="Edit your details" onBack={() => setScreen("home")}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>} />
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 80px" }}>
          <ProfileForm form={profileForm} setForm={setProfileForm} email={user.email} />
          {profileStatus && (
            <div style={{ marginBottom: 12, padding: "10px 12px", fontSize: 13, borderRadius: 2,
              background: profileStatus.kind === "error" ? "#fdf0f0" : "#eef6ec",
              color:      profileStatus.kind === "error" ? C.crimson : C.green,
              border: `1px solid ${profileStatus.kind === "error" ? C.crimson : C.green}` }}>
              {profileStatus.message}
            </div>
          )}
          <button onClick={() => handleSaveProfile(user.email)} disabled={profileSaving}
            style={S.primaryBtn(C.crimson, profileSaving)}>
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — HOME
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "home") {
    const myActs = activitiesByEmail.get(user.email?.toLowerCase()) || [];
    const storedStravaIds = new Set();
    const actByDate = {};
    for (const a of myActs) {
      if (a.strava_data?.id) storedStravaIds.add(a.strava_data.id);
      if (a.source === "session" && !actByDate[a.activity_date]) actByDate[a.activity_date] = a;
    }
    const weekBars = [7,6,5,4,3,2,1,0].map(ago => ({
      km: weekKm(myActs, null, ago) + stravaWeekKm(stravaActivities, storedStravaIds, ago),
      weeksAgo: ago,
      label: ago === 0 ? "NOW" : `W-${ago}`,
    }));
    const maxBarKm = Math.max(...weekBars.map(b => b.km), 1);
    const thisWeekKm = weekBars[7].km;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title={athleteData.name}
          subtitle="Training Log"
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 0 80px" }}>

          <div onClick={() => setScreen("profile")}
            style={{ margin:"20px 16px", background:C.white, border:`1px solid ${C.rule}`, borderLeft:`3px solid ${C.crimson}`, borderRadius:2, padding:"14px 18px", cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:C.crimson, textTransform:"uppercase", marginBottom:4, fontFamily:S.bodyFont }}>Season Goal</div>
              <div style={{ fontSize:11, color:C.mid }}>Edit ›</div>
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:C.navy, fontFamily:S.displayFont }}>{fmtPbGoal(profile?.goals) || athleteData.goal || "Set your goal"}</div>
            <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>Current PB: {fmtPbGoal(profile?.pbs) || athleteData.current || "—"}</div>
          </div>

          {/* 8-Week Rolling Volume */}
          <div style={{ margin:"0 16px 16px", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:4, fontFamily:S.bodyFont }}>This Week</div>
                <div style={{ fontSize:26, fontWeight:900, color:C.navy, fontFamily:S.displayFont }}>
                  {hoveredWeekIdx !== null ? weekBars[hoveredWeekIdx].km.toFixed(1) : thisWeekKm.toFixed(1)}
                  <span style={{ fontSize:14, color:C.mid, fontWeight:400 }}> km</span>
                  {hoveredWeekIdx !== null && hoveredWeekIdx !== 7 && (
                    <span style={{ fontSize:11, color:C.mid, fontWeight:400, marginLeft:8 }}>{weekBars[hoveredWeekIdx].label}</span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:3, alignItems:"flex-end" }}>
              {weekBars.map((b, i) => {
                const BAR_MAX_PX = 52;
                const pct = maxBarKm > 0 ? b.km / maxBarKm : 0;
                const barPx = b.km > 0 ? Math.max(Math.round(pct * BAR_MAX_PX), 4) : 2;
                const isCurrent = b.weeksAgo === 0;
                const isHovered = hoveredWeekIdx === i;
                return (
                  <div key={i}
                    onMouseEnter={() => setHoveredWeekIdx(i)}
                    onMouseLeave={() => setHoveredWeekIdx(null)}
                    onClick={(e) => { e.stopPropagation(); setHoveredWeekIdx(prev => prev === i ? null : i); }}
                    data-bar-chart="1"
                    style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", cursor:"pointer", userSelect:"none" }}>
                    <div style={{ fontSize:9, color: isHovered ? C.navy : "transparent", marginBottom:3, fontWeight:600, minHeight:12, lineHeight:1 }}>
                      {b.km > 0 ? b.km.toFixed(1) : ""}
                    </div>
                    <div style={{ width:"100%", height:BAR_MAX_PX, display:"flex", alignItems:"flex-end" }}>
                      <div style={{
                        width:"100%",
                        height: barPx,
                        background: isCurrent ? C.crimson : isHovered ? C.mid : C.lightRule,
                        borderRadius:"3px 3px 0 0",
                        transition:"background 0.15s",
                        opacity: b.km === 0 ? 0.4 : 1,
                      }}/>
                    </div>
                    <div style={{ width:"100%", height:1, background:C.rule, margin:"3px 0" }}/>
                    <div style={{ fontSize:7, color: isCurrent ? C.mid : C.lightRule, letterSpacing:0.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>
                      {b.label}
                    </div>
                  </div>
                );
              })}
            </div>
            {(activitiesByEmail.get(user.email?.toLowerCase()) || []).length === 0 && (
              <div style={{ marginTop:10, fontSize:11, color:C.mid, textAlign:"center" }}>Log your first run to start tracking km</div>
            )}
          </div>


          {/* Strava connect / connected status */}
          <div style={{ margin:"0 16px 14px" }}>
            {stravaConnected ? (
              <div style={{ display:"flex", alignItems:"center", gap:8, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"10px 14px" }}>
                <span style={{ fontSize:16 }}>🟠</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.green }}>Strava Connected</div>
                  <div style={{ fontSize:11, color:C.mid }}>Import runs when logging a session</div>
                </div>
              </div>
            ) : (
              <button onClick={connectStrava} style={{ width:"100%", background:"#FC4C02", border:"none", borderRadius:2, padding:"12px 16px", color:"white", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, letterSpacing:0.5 }}>
                <span style={{ fontSize:18 }}>🟠</span> Connect Strava
              </button>
            )}
          </div>

          {/* Week picker — date input snaps to the Monday of any chosen day */}
          {activeMonday && (() => {
            const today = new Date(); today.setHours(0,0,0,0);
            const monDate = new Date(activeMonday + "T00:00:00");
            const sunDate = new Date(monDate); sunDate.setDate(monDate.getDate() + 6); sunDate.setHours(23,59,59,999);
            const isCurrent = today >= monDate && today <= sunDate;
            const isPast = today > sunDate;
            const planned = weeks.find(w => w.weekStart === activeMonday);
            const fmtRange = () => {
              const m = monDate.toLocaleString("en-AU", { month: "short" });
              const m2 = sunDate.toLocaleString("en-AU", { month: "short" });
              return m === m2
                ? `${monDate.getDate()}–${sunDate.getDate()} ${m}`
                : `${monDate.getDate()} ${m} – ${sunDate.getDate()} ${m2}`;
            };
            const w = planned || { weekStart: activeMonday, weekLabel: fmtRange(), sessions: [] };
            const wkEnd = weekEndStr(w.weekStart);
            const extraActs = myActs.filter(a =>
              a.source !== "session" &&
              a.activity_date >= w.weekStart &&
              a.activity_date <= wkEnd
            );
            const sessionsDone = w.sessions.filter(s => logs[s.id] || actByDate[sessionDateStr(w.weekStart, s.day)]).length;

            const snapToMonday = (dateStr) => {
              if (!dateStr) return;
              const d = new Date(dateStr + "T00:00:00");
              if (isNaN(d)) return;
              const dow = d.getDay();
              const off = dow === 0 ? -6 : 1 - dow;
              d.setDate(d.getDate() + off);
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const dy = String(d.getDate()).padStart(2, "0");
              setActiveMonday(`${y}-${m}-${dy}`);
            };

            return (
              <div style={{ padding:"0 16px" }}>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:6, fontFamily:S.bodyFont }}>Week of</div>
                  <input
                    type="date"
                    value={activeMonday}
                    onChange={(e) => snapToMonday(e.target.value)}
                    style={{
                      width:"100%",
                      background: isCurrent ? C.crimson : C.white,
                      color: isCurrent ? "#fffdf8" : C.navy,
                      border:`1px solid ${isCurrent ? "#E06666" : C.rule}`,
                      borderRadius:2,
                      padding:"12px 14px",
                      fontSize:13,
                      fontWeight:700,
                      letterSpacing:0.5,
                      fontFamily:S.bodyFont,
                      cursor:"pointer",
                      colorScheme: isCurrent ? "dark" : "light",
                    }}/>
                  <div style={{ fontSize:10, color:C.mid, marginTop:6, paddingLeft:2, letterSpacing:1 }}>
                    {w.weekLabel}{isCurrent ? " · THIS WEEK" : isPast ? " · PAST" : " · UPCOMING"}
                    {isPast && sessionsDone > 0 ? ` · ${sessionsDone}/${w.sessions.length} logged` : ""}
                  </div>
                </div>

                <div style={{ marginBottom:14 }}>
                  <DndContext
                    sensors={dndSensors}
                    onDragEnd={({ active, over }) => {
                      if (!over) return;
                      const [aKind, aId] = String(active.id).split(":");
                      const [oKind, oDate] = String(over.id).split(":");
                      if (aKind !== "session" || oKind !== "day") return;
                      handleSessionDrop(aId, oDate, w.weekStart);
                    }}
                  >
                    {DAY_LABELS.map(dayLabel => {
                      const dayDate = sessionDateStr(w.weekStart, dayLabel);
                      const isToday = dayDate === todayStr();
                      const sessionsHere = w.sessions
                        .map(s => ({ s, log: logs[s.id] }))
                        .filter(({ s, log }) => {
                          const overrideDate = log?.analysis?.actual_date;
                          if (overrideDate && dayDate) return overrideDate === dayDate;
                          return s.day?.slice(0, 3) === dayLabel;
                        });
                      const extrasHere = dayDate ? extraActs.filter(a => a.activity_date === dayDate) : [];
                      const hasItems = sessionsHere.length + extrasHere.length > 0;
                      return (
                        <DayRow
                          key={dayLabel}
                          dateStr={dayDate}
                          dayLabel={dayLabel}
                          isToday={isToday}
                          hasItems={hasItems}
                          onAddRun={dayDate ? () => {
                            setLogForm({ date: dayDate, distanceKm: "", durationMin: "", type: "Run", notes: "" });
                            setEditingActivityId(null);
                            clearStravaSelection();
                            setScreen("log-activity");
                          } : null}
                        >
                          {sessionsHere.map(({ s, log }) => {
                            const sDate = log?.analysis?.actual_date || sessionDateStr(w.weekStart, s.day);
                            const linkedAct = actByDate[sDate];
                            const hasFullFeedback = log?.feedback && log.feedback.trim().length > 0;
                            return (
                              <DraggableSession
                                key={s.id}
                                session={s}
                                log={log}
                                linkedAct={linkedAct}
                                onClick={() => {
                                  setActiveSession({ ...s, weekStart: w.weekStart });
                                  setFeedbackText("");
                                  setSessionDistKm("");
                                  setSessionDurMin("");
                                  setSessionDateOverride(log?.analysis?.actual_date || linkedAct?.activity_date || todayStr());
                                  setScreen((log && hasFullFeedback) ? "result" : "session");
                                }}
                              />
                            );
                          })}
                          {extrasHere.map(act => (
                            <ExtraActivityCard
                              key={act.id}
                              act={act}
                              onClick={() => { setActiveExtraActivity(act); setScreen("extra-activity"); }}
                            />
                          ))}
                        </DayRow>
                      );
                    })}
                  </DndContext>
                </div>

                <button onClick={()=>setScreen("history")} style={{
                  width:"100%", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2,
                  padding:"10px", color:C.mid, fontSize:11, cursor:"pointer", marginBottom:16, letterSpacing:1,
                }}>HISTORY →</button>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — LOG ACTIVITY
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "log-activity") {
    const activityTypes = ["Run","Long Run","Easy Run","Tempo","Speed","Trail Run","Race","Strength","Cross-train","Other"];
    const canSubmit = logForm.distanceKm && parseFloat(logForm.distanceKm) > 0 && logForm.date;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={editingActivityId ? "Edit Run" : "Log Activity"} subtitle={editingActivityId ? "Update entry" : "Manual Entry"} onBack={()=>{ clearStravaSelection(); setStravaActivities([]); setEditingActivityId(null); setScreen("home"); }}/>
        <form
          onSubmit={(e) => { e.preventDefault(); if (canSubmit && !logSaving) saveActivity(logForm, stravaDetail); }}
          style={{ maxWidth:500, margin:"0 auto", padding:"20px 16px 80px" }}
        >
          {stravaConnected && (
            <StravaActivityPicker
              compact={true}
              activities={stravaActivities}
              loading={stravaActivitiesLoading}
              selectedId={selectedStravaId}
              detail={stravaDetail}
              detailLoading={stravaDetailLoading}
              onOpen={() => { fetchStravaActivities(); }}
              onSelect={async (id) => {
                setSelectedStravaId(id);
                if (id) {
                  const d = await fetchStravaDetail(id);
                  if (d) {
                    const actDate = stravaActivities.find(a=>a.id===id)?.start_date_local?.split("T")[0] || logForm.date;
                    setLogForm(f=>({ ...f, date: actDate, distanceKm: (d.distance_m/1000).toFixed(2), durationMin: Math.round(d.moving_time_s/60).toString() }));
                  }
                } else clearStravaSelection();
              }}
              onClear={() => { clearStravaSelection(); }}
            />
          )}

          <SectionCard label="Activity Details">
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Date</div>
              <input
                type="date"
                value={logForm.date}
                onChange={e=>setLogForm(f=>({...f, date:e.target.value}))}
                style={{ ...S.input, width:"auto" }}
              />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Activity Type</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {activityTypes.map(t=>(
                  <button key={t} type="button" onClick={()=>setLogForm(f=>({...f, type:t}))}
                    style={{ background:logForm.type===t?C.crimson:C.white, border:`1px solid ${logForm.type===t?C.crimson:C.rule}`, borderRadius:2, padding:"5px 12px", color:logForm.type===t?"#fffdf8":C.mid, fontSize:12, cursor:"pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {!stravaDetail && (
              <div style={{ display:"flex", gap:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Distance (km)</div>
                  <input
                    type="number" step="0.01" min="0" placeholder="e.g. 10.5"
                    value={logForm.distanceKm}
                    onChange={e=>setLogForm(f=>({...f, distanceKm:e.target.value}))}
                    style={{ ...S.input }}
                  />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Duration (min)</div>
                  <input
                    type="number" step="1" min="0" placeholder="e.g. 55"
                    value={logForm.durationMin}
                    onChange={e=>setLogForm(f=>({...f, durationMin:e.target.value}))}
                    style={{ ...S.input }}
                  />
                </div>
              </div>
            )}
          </SectionCard>

          {stravaDetail && <StravaCard data={stravaDetail} />}

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Notes (optional)</div>
            <textarea
              placeholder="How did it feel? Any highlights?"
              value={logForm.notes}
              onChange={e=>setLogForm(f=>({...f, notes:e.target.value}))}
              style={{ ...S.textarea, minHeight:80 }}
            />
          </div>

          {logError && <div style={{ color:C.crimson, fontSize:13, marginBottom:10, textAlign:"center", padding:"8px", background:"#fdf0f0", borderRadius:2, border:`1px solid ${C.rule}` }}>{logError}</div>}
          <button type="submit" disabled={!canSubmit||logSaving}
            style={S.primaryBtn("#E06666", !canSubmit||logSaving)}>
            {logSaving ? "Saving..." : "Save Activity →"}
          </button>
        </form>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — SESSION LOG
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "session" && activeSession) return (
    <div style={S.page}>
      <div style={S.grain}/>
      <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>{ clearStravaSelection(); setStravaActivities([]); setScreen("home"); }}/>
      <form
        onSubmit={(e) => { e.preventDefault(); if (sessionDistKm && !isSaving) handleSubmitFeedback(); }}
        style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}
      >
        <SectionCard label="Today's Session">
          {activeSession.desc.split("\n").filter(l => !/^\w{3} \w{3} \d{2} \d{4} \d{2}:\d{2}:\d{2}/.test(l.trim())).map((l,i)=>(
            <div key={i} style={{ fontSize:14, color:i===0?C.navy:C.mid, lineHeight:1.9 }}>{l}</div>
          ))}
          <div style={{ display:"flex", gap:20, marginTop:12, paddingTop:12, borderTop:`1px solid ${C.lightRule}` }}>
            <MiniStat label="Terrain" val={activeSession.terrain}/>
            <MiniStat label="Target Pace" val={activeSession.pace} color="#E06666"/>
          </div>
        </SectionCard>

        {stravaConnected && (
          <StravaActivityPicker
            activities={stravaActivities}
            loading={stravaActivitiesLoading}
            selectedId={selectedStravaId}
            detail={stravaDetail}
            detailLoading={stravaDetailLoading}
            onOpen={() => { fetchStravaActivities(); }}
            onSelect={async (id) => {
              setSelectedStravaId(id);
              if (id) {
                const d = await fetchStravaDetail(id);
                if (d) {
                  setSessionDistKm((d.distance_m / 1000).toFixed(2));
                  setSessionDurMin(Math.round(d.moving_time_s / 60).toString());
                  const actDate = stravaActivities.find(a => a.id === id)?.start_date_local?.split("T")[0];
                  if (actDate) setSessionDateOverride(actDate);
                }
              } else clearStravaSelection();
            }}
            onClear={() => { clearStravaSelection(); }}
          />
        )}


        {!stravaDetail && (
          <div style={{ display:"flex", gap:12, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Distance (km)</div>
              <input type="number" step="0.01" min="0" placeholder="e.g. 10.5"
                value={sessionDistKm} onChange={e=>setSessionDistKm(e.target.value)}
                style={S.input}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Duration (min)</div>
              <input type="number" step="1" min="0" placeholder="e.g. 55"
                value={sessionDurMin} onChange={e=>setSessionDurMin(e.target.value)}
                style={S.input}/>
            </div>
          </div>
        )}
        <div style={{ fontSize:11, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:10 }}>How did it go?</div>
        <textarea value={feedbackText} onChange={e=>setFeedbackText(e.target.value)}
          placeholder="Tell me about the session... how did it feel? Did you hit the paces? Any soreness or highlights?"
          style={S.textarea}/>

        <button type="submit"
          disabled={!sessionDistKm||isSaving}
          style={S.primaryBtn("#E06666", !sessionDistKm||isSaving)}>
          {isSaving ? "Saving..." : "Save Session →"}
        </button>
      </form>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — RESULT
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "result" && activeSession) {
    const log = logs[activeSession.id];
    const an  = log?.analysis;
    const resultSDate = activeSession.weekStart ? sessionDateStr(activeSession.weekStart, activeSession.day) : null;
    const resultLinkedAct = resultSDate ? findAthAct(user.email, resultSDate) : null;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>setScreen("home")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}>
          <div style={{ textAlign:"center", fontSize:64, margin:"20px 0 8px" }}>{an?.emoji || "✓"}</div>
          <div style={{ textAlign:"center", fontSize:14, color:C.green, fontWeight:700, marginBottom:20, letterSpacing:1 }}>SESSION LOGGED</div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {an?.distance_km && <StatPill label="Distance" val={`${an.distance_km}km`} color="#4ade80"/>}
            {an?.duration_min && <StatPill label="Duration" val={`${an.duration_min}min`}/>}
          </div>
          {log?.strava_data && <StravaCard data={log.strava_data}/>}
          {(log?.feedback || feedbackText) && (
            <SectionCard label="Your Notes">
              <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, fontStyle:"italic" }}>"{log?.feedback || feedbackText}"</div>
            </SectionCard>
          )}
          {(log?.coach_reply || resultLinkedAct?.coach_reply) && (
            <SectionCard label="💬 Message from Coach" accent="#3b82f6">
              <div style={{ fontSize:14, color:C.navy, lineHeight:1.8 }}>{log?.coach_reply || resultLinkedAct?.coach_reply}</div>
            </SectionCard>
          )}
          <button onClick={() => {
            const an = log?.analysis;
            setFeedbackText(log?.feedback || "");
            setSessionDistKm(an?.distance_km?.toString() || "");
            setSessionDurMin(an?.duration_min?.toString() || "");
            setSessionDateOverride(an?.actual_date || resultLinkedAct?.activity_date || sessionDateStr(activeSession.weekStart, activeSession.day));
            if (log?.strava_data) setStravaDetail(log.strava_data);
            setScreen("session");
          }} style={{ ...S.ghostBtn, marginBottom: 8 }}>Edit session →</button>
          <button onClick={async () => {
            if (!confirm("Delete this session log? Any activity created from it will also be removed.")) return;
            const ok = await deleteSessionLog(activeSession.id, resultLinkedAct?.id);
            if (ok) { setActiveSession(null); setScreen("home"); }
          }} style={{ ...S.ghostBtn, marginBottom: 8, color: C.crimson, borderColor: C.crimson }}>Delete session</button>
          <button onClick={()=>setScreen("home")} style={S.ghostBtn}>← Back to week</button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — EXTRA ACTIVITY DETAIL
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "extra-activity" && activeExtraActivity) {
    const act = activeExtraActivity;
    const durMin = act.duration_seconds ? Math.round(act.duration_seconds / 60) : null;
    const dateLabel = act.activity_date ? act.activity_date.slice(5).replace("-", " ") : "";
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={act.activity_type || "Run"} subtitle={dateLabel} onBack={()=>{ setActiveExtraActivity(null); setScreen("home"); }}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}>
          <div style={{ textAlign:"center", fontSize:48, margin:"20px 0 8px" }}>➕</div>
          <div style={{ textAlign:"center", fontSize:14, color:C.crimson, fontWeight:700, marginBottom:20, letterSpacing:1 }}>EXTRA RUN</div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {act.distance_km && <StatPill label="Distance" val={`${act.distance_km}km`} color="#4ade80"/>}
            {durMin && <StatPill label="Duration" val={`${durMin}min`}/>}
          </div>
          {act.strava_data && <StravaCard data={act.strava_data}/>}
          {act.notes && (
            <SectionCard label="Your Notes">
              <div style={{ fontSize:14, color:C.navy, lineHeight:1.8, fontStyle:"italic" }}>"{act.notes}"</div>
            </SectionCard>
          )}
          {act.coach_reply && (
            <SectionCard label="💬 Message from Coach" accent="#3b82f6">
              <div style={{ fontSize:14, color:C.navy, lineHeight:1.8 }}>{act.coach_reply}</div>
            </SectionCard>
          )}
          <button onClick={() => {
            setLogForm({
              date: act.activity_date,
              distanceKm: act.distance_km?.toString() || "",
              durationMin: act.duration_seconds ? Math.round(act.duration_seconds / 60).toString() : "",
              type: act.activity_type || "Run",
              notes: act.notes || "",
            });
            if (act.strava_data) setStravaDetail(act.strava_data);
            setEditingActivityId(act.id);
            setActiveExtraActivity(null);
            setScreen("log-activity");
          }} style={{ ...S.ghostBtn, marginBottom: 8 }}>Edit run →</button>
          <button onClick={async () => {
            if (!confirm("Delete this run?")) return;
            const ok = await deleteActivity(act.id);
            if (ok) { setActiveExtraActivity(null); setScreen("home"); }
          }} style={{ ...S.ghostBtn, marginBottom: 8, color: C.crimson, borderColor: C.crimson }}>Delete run</button>
          <button onClick={()=>{ setActiveExtraActivity(null); setScreen("home"); }} style={S.ghostBtn}>← Back to week</button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — HISTORY
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "history") {
    const logged     = allSessions.filter(s=>logs[s.id]);
    const compliance = allSessions.length ? Math.round((logged.length/allSessions.length)*100) : 0;
    const totalKm    = weekKm(activities, user.email, 0) + weekKm(activities, user.email, 1) + weekKm(activities, user.email, 2) + weekKm(activities, user.email, 3);
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title="My Progress" subtitle="Block 4" onBack={()=>setScreen("home")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>
          <div style={{ display:"flex", gap:10, marginBottom:24 }}>
            {[
              { label:"Compliance", val:`${compliance}%`, color: compliance>75?"#4ade80":"#fbbf24" },
              { label:"Sessions",   val:`${logged.length}/${allSessions.length}` },
              { label:"Block Km",   val:`${totalKm.toFixed(0)}`, color:C.navy },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:20, fontWeight:900, color:s.color||C.navy }}>{s.val}</div>
                <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <SectionCard label="Weekly Compliance">
            {weeks.map((w,i)=>{
              const done = w.sessions.filter(s=>logs[s.id]).length;
              const pct  = Math.round((done/w.sessions.length)*100);
              return (
                <div key={i} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                    <span style={{ color:C.mid }}>{w.weekLabel}</span>
                    <span style={{ color: pct>75?"#4ade80":pct>40?"#fbbf24":"#f87171" }}>{done}/{w.sessions.length}</span>
                  </div>
                  <div style={{ background:C.cream, borderRadius:2, height:4 }}>
                    <div style={{ width:`${pct}%`, height:4, borderRadius:2, background: pct>75?"#4ade80":pct>40?"#fbbf24":"#f87171" }}/>
                  </div>
                </div>
              );
            })}
          </SectionCard>
          <div style={{ fontSize:11, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:12 }}>Session Log</div>
          {logged.length===0 && <div style={{ color:C.mid, fontSize:14, textAlign:"center", padding:"20px 0" }}>No sessions logged yet.</div>}
          {logged.map(s=>{
            const log = logs[s.id];
            const an  = log?.analysis;
            const TAG_EMOJI = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
            return (
              <div key={s.id} onClick={()=>{ setActiveSession({...s}); setScreen("result"); }}
                style={{ ...S.card, display:"flex", gap:12, alignItems:"center", marginBottom:8, cursor:"pointer" }}>
                <div style={{ fontSize:22 }}>{an?.emoji || TAG_EMOJI[s.tag] || "🏃"}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{s.day} · {s.type}</div>
                  {an?.distance_km && (
                    <div style={{ fontSize:12, color:C.mid, marginTop:2 }}>
                      {an.distance_km}km{an.duration_min ? ` · ${an.duration_min}min` : ""}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:11, color: COMPLY_COLOR[an?.compliance||"completed"] }}>
                  {COMPLY_LABEL[an?.compliance||"completed"]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
