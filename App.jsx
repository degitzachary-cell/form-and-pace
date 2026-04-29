import { useState, useEffect, useMemo } from "react";
import { useWindowWidth, useRealtimeSync, useAthleteStats } from "./lib/hooks.js";
import CoachPlanBuilder from "./CoachPlanBuilder";
import { supabase, exchangeStravaCode } from "./lib/supabase.js";
import { checkStravaConnection, connectStrava, fetchStravaActivities, fetchStravaDetail } from "./lib/strava.js";
import {
  weekKm, stravaWeekKm, sessionDateStr, weekEndStr,
  prettyEmailName, todayStr, newId,
  snapToMonday, thisMonday,
} from "./lib/helpers.js";
import { C, S, TAG_STYLE, TYPE_STYLE, typeStyle, COMPLY_COLOR, COMPLY_LABEL, TAG_EMOJI } from "./styles.js";
import {
  PROFILE_DISTANCES, EMPTY_PB_GOAL, PB_GOAL_LABEL, DAY_LABELS, DAY_LONG,
  parseTime, normalizePlan, cleanPbGoal, fmtPbGoal,
} from "./lib/constants.js";
import { Header, SectionCard, StatPill, MiniStat, StravaCard, StravaActivityPicker } from "./components.jsx";
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

// ─── ATHLETE PROGRAMS ─────────────────────────────────────────────────────────
// Programs are stored in the coach_plans table; coaches edit via Plan Builder.
// New athletes get a blank program until their coach creates one.
const ATHLETE_PROGRAMS = {};

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
// ─── ATHLETE WEEK GRID ────────────────────────────────────────────────────────

function DraggableSession({ session, log, linkedAct, isMissed, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `session:${session.id}`,
  });
  const ts = typeStyle(session.type);
  const isLogged = !!log || !!linkedAct;
  const showMissed = isMissed && !isLogged;
  const style = {
    background: isLogged ? ts.bg : showMissed ? "#fdf0f0" : C.white,
    borderTop: `1px solid ${isLogged ? ts.border : showMissed ? "#e6b8b8" : C.rule}`,
    borderRight: `1px solid ${isLogged ? ts.border : showMissed ? "#e6b8b8" : C.rule}`,
    borderBottom: `1px solid ${isLogged ? ts.border : showMissed ? "#e6b8b8" : C.rule}`,
    borderLeft: `4px solid ${ts.accent}`,
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
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: ts.pattern || ts.bg,
        border: `1.5px solid ${ts.accent}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0, color: ts.accent, fontWeight: 700,
      }}>
        {ts.pattern ? "" : (session.type || "").slice(0, 1).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.type}</div>
          {isLogged ? <div style={{ fontSize: 10, color: C.green, flexShrink: 0 }}>✓</div>
            : showMissed ? <div style={{ fontSize: 9, color: C.crimson, flexShrink: 0, letterSpacing: 1, fontWeight: 700 }}>MISSED</div>
            : null}
        </div>
        <div style={{ fontSize: 11, color: ts.accent, marginTop: 2, fontFamily: "monospace" }}>{session.pace}</div>
        {log?.analysis?.actual_date && session.day && (
          <div style={{ fontSize: 9, color: C.crimson, marginTop: 3, letterSpacing: 1, fontWeight: 600 }}>
            ↪ MOVED FROM {session.day.slice(0, 3).toUpperCase()}
          </div>
        )}
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
  const [screen,        setScreen]        = useState("today");
  const [activeSession, setActiveSession] = useState(null);
  const [activeExtraActivity, setActiveExtraActivity] = useState(null);
  const [activeMonday, setActiveMonday] = useState(null);
  const [coachActiveMonday, setCoachActiveMonday] = useState(null);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const [feedbackText,  setFeedbackText]  = useState("");
  const [sessionDistKm, setSessionDistKm] = useState("");
  const [sessionDurMin, setSessionDurMin] = useState("");
  const [sessionDateOverride, setSessionDateOverride] = useState(null);
  // Wellness — manually entered each session log. Stored in analysis.wellness.
  const [sessionRpe,       setSessionRpe]       = useState(null);  // 1–10
  const [sessionSleepHrs,  setSessionSleepHrs]  = useState("");    // free number
  const [sessionSoreness,  setSessionSoreness]  = useState(null);  // 1–5
  const [sessionMood,      setSessionMood]      = useState(null);  // 1–5
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
  const [coachFilter,   setCoachFilter]   = useState("all");
  const [coachEditAct,  setCoachEditAct]  = useState(null);  // { date, distance, duration } draft for active activity edit
  const [coachEditLog,  setCoachEditLog]  = useState(null);  // { date, distance, duration } draft for active log edit
  const [athletePrograms, setAthletePrograms] = useState(ATHLETE_PROGRAMS);
  const [workoutTemplates, setWorkoutTemplates] = useState([]);

  const isDesktop = useWindowWidth() >= 960;

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
          // Coaches may edit name/goal/PB straight into the plan so athletes
          // who haven't signed in yet still render correctly.
          const { weeks, meta } = normalizePlan(row.plan_json);
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
      refreshStravaConnection();
    }
  }, [user, role]);

  // Default the coach calendar to today's Monday whenever they open an athlete
  // (desktop: also runs when an athlete is selected on the dashboard panel).
  useEffect(() => {
    const isAthleteContext = role === "coach" && dashAthlete &&
      (coachScreen === "athlete" || (isDesktop && coachScreen === "dashboard"));
    if (!isAthleteContext) {
      if (coachActiveMonday !== null) setCoachActiveMonday(null);
      return;
    }
    if (coachActiveMonday) return;
    setCoachActiveMonday(thisMonday());
  }, [role, coachScreen, dashAthlete, coachActiveMonday, isDesktop]);

  // ── Live sync: subscribe to session_logs + activities + coach_plans ──
  useRealtimeSync({ user, role, setLogs, setActivities, setAthletePrograms });

  // ── Load coach's workout templates once ──
  useEffect(() => {
    if (role !== "coach" || !user?.email) return;
    supabase.from("workout_templates").select("*").eq("coach_email", user.email.toLowerCase())
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("templates load error:", error); return; }
        setWorkoutTemplates(data || []);
      });
  }, [role, user?.email]);

  // ── Refresh logs+activities when coach opens an athlete or returns to tab ──
  // The boot-time loadLogs() runs once; without this the coach sees stale data
  // when athletes drag-reschedule or log new runs.
  useEffect(() => {
    if (role !== "coach") return;
    if (coachScreen === "athlete" && dashAthlete) {
      Promise.all([loadLogs(), loadActivities()]).catch(e => console.error("coach refresh error:", e));
    }
    const onVis = () => {
      if (document.visibilityState === "visible") {
        Promise.all([loadLogs(), loadActivities()]).catch(e => console.error("coach refresh error:", e));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [role, coachScreen, dashAthlete]);

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
    // Strava-first: if importing from Strava, the activity's real date wins.
    const stravaDate = stravaDetailData?.start_date_local?.slice(0, 10)
                    || stravaDetailData?.start_date?.slice(0, 10);
    const effectiveDate = stravaDate || form.date;
    const basePayload = {
      activity_date: effectiveDate,
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
      // Auto-link to matching scheduled session for the actual date.
      if (programEntry) {
        const allSessionsWithDate = programEntry.weeks.flatMap(w =>
          w.sessions.map(s => ({ ...s, weekStart: w.weekStart }))
        );
        const matchedSession = allSessionsWithDate.find(
          s => sessionDateStr(s.weekStart, s.day) === effectiveDate
        );
        if (matchedSession && !logs[matchedSession.id]) {
          const TAG_EMOJI = { speed:"⚡", tempo:"🎯", easy:"🏃" };
          const scheduledDate = sessionDateStr(matchedSession.weekStart, matchedSession.day);
          const autoAnalysis = {
            compliance: "completed",
            emoji: TAG_EMOJI[matchedSession.tag] || "🏃",
            distance_km: parseFloat(form.distanceKm),
            duration_min: form.durationMin ? parseFloat(form.durationMin) : null,
            // Only set actual_date if the run happened on a different day than scheduled.
            ...(effectiveDate !== scheduledDate ? { actual_date: effectiveDate } : {}),
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
    setActiveMonday(null); setCoachActiveMonday(null); setHoveredWeekIdx(null);
    setCoachReply(""); setFeedbackText("");
    setSessionDistKm(""); setSessionDurMin(""); setSessionDateOverride(null);
    setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
    setScreen("today"); setCoachScreen("dashboard");
    setDashAthlete(null);
  };

  const refreshStravaConnection = async () => {
    setStravaConnected(await checkStravaConnection());
  };

  // Auto-fetch recent Strava activities for the rolling volume graph.
  // Refreshes whenever the tab regains focus so athletes don't manually re-sync.
  useEffect(() => {
    if (!stravaConnected) return;
    loadStravaActivities();
    const onVis = () => { if (document.visibilityState === "visible") loadStravaActivities(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [stravaConnected]);


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

  const loadStravaActivities = async () => {
    if (stravaActivitiesLoading) return;
    setStravaActivitiesLoading(true);
    try {
      const data = await fetchStravaActivities();
      if (data) setStravaActivities(data);
    } catch(e) { console.error("strava list error", e); }
    setStravaActivitiesLoading(false);
  };

  const loadStravaDetail = async (id) => {
    setStravaDetailLoading(true);
    setStravaDetail(null);
    try {
      const extracted = await fetchStravaDetail(id);
      if (extracted) {
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
    const prevDate = existingAnalysis.actual_date || scheduledDate;
    const nextAnalysis = { ...existingAnalysis };
    if (newDate === scheduledDate) delete nextAnalysis.actual_date;
    else nextAnalysis.actual_date = newDate;
    try { await saveLog(sessionId, { analysis: nextAnalysis }); }
    catch (e) { console.error("drag-move saveLog error:", e); }

    // Keep the linked activity's date in sync so coach views, weekly km totals,
    // and actByDate lookups land on the new day too. Only updates if a
    // matching activity exists at the previous date.
    if (prevDate && prevDate !== newDate) {
      const linked = findAthAct(user.email, prevDate);
      if (linked) {
        const { data: updAct, error } = await supabase
          .from("activities")
          .update({ activity_date: newDate })
          .eq("id", linked.id)
          .select()
          .single();
        if (error) console.error("drag-move activity sync error:", error);
        if (updAct) setActivities(prev => prev.map(a => a.id === updAct.id ? updAct : a));
      }
    }
  };

  // Default the athlete week to the current week (Monday of today) on first mount.
  useEffect(() => {
    if (role !== "athlete" || activeMonday !== null) return;
    setActiveMonday(thisMonday());
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
      // Strava-first: when a Strava activity is attached, the run's actual date
      // wins over any user-picked override.
      const stravaDate = stravaDetail?.start_date_local?.slice(0,10) || stravaDetail?.start_date?.slice(0,10);
      const sessionDate = stravaDate || sessionDateOverride || scheduledDate
        || (() => { const d = new Date(); const y = d.getFullYear(); const mo = String(d.getMonth()+1).padStart(2,"0"); const dy = String(d.getDate()).padStart(2,"0"); return `${y}-${mo}-${dy}`; })();
      const wellness = {
        ...(sessionRpe       != null ? { rpe:         sessionRpe       } : {}),
        ...(sessionSleepHrs  !== ""  ? { sleep_hours: parseFloat(sessionSleepHrs) } : {}),
        ...(sessionSoreness  != null ? { soreness:    sessionSoreness  } : {}),
        ...(sessionMood      != null ? { mood:        sessionMood      } : {}),
      };
      const analysis = {
        compliance: "completed",
        emoji: TAG_EMOJI[s.tag] || "🏃",
        distance_km: parseFloat(sessionDistKm),
        duration_min: sessionDurMin ? parseFloat(sessionDurMin) : null,
        ...(sessionDate !== scheduledDate ? { actual_date: sessionDate } : {}),
        ...(Object.keys(wellness).length ? { wellness } : {}),
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
        if (role === "athlete") setScreen("today");
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

  const { activitiesByEmail, statsFor } = useAthleteStats({ activities, athletePrograms, logs });

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
    const today = todayStr();
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

    // Compute per-athlete: 7-day dot strip, replies-needed count, status flag.
    const athleteRows = athletes.map(([email, data]) => {
      const weeksList = Array.isArray(data.weeks) ? data.weeks : [];
      // Index planned sessions by date — skip REST entries (they shouldn't
      // count as a workout-to-do).
      const sessionsByDate = new Map();
      for (const w of weeksList) {
        for (const s of (w.sessions || [])) {
          if ((s.type || "").toUpperCase() === "REST") continue;
          const log = logs[s.id];
          const onDate = log?.analysis?.actual_date || sessionDateStr(w.weekStart, s.day);
          if (onDate) sessionsByDate.set(onDate, { s, log });
        }
      }
      const myActs = (activities || []).filter(a => a.athlete_email?.toLowerCase() === email.toLowerCase());
      const actsByDate = new Map();
      for (const a of myActs) actsByDate.set(a.activity_date, a);

      // Index session_logs by their effective date for athletes who logged a
      // run without a matching activity row. Falls back to updated_at when
      // analysis.actual_date is missing AND no activity was created.
      const orphanLogsByDate = new Map();
      for (const w of weeksList) {
        for (const s of (w.sessions || [])) {
          const log = logs[s.id];
          if (!log?.analysis?.distance_km) continue;
          const planDate = sessionDateStr(w.weekStart, s.day);
          const onDate = log.analysis.actual_date || planDate;
          if (actsByDate.has(onDate)) continue;
          // Use updated_at if the scheduled date predates the log by >2 days
          // (athlete logged catch-up well after the planned day).
          const upd = log.updated_at?.split("T")[0];
          const effective = upd && upd !== onDate ? upd : onDate;
          if (!orphanLogsByDate.has(effective)) orphanLogsByDate.set(effective, log);
        }
      }

      // Current week Mon → Sun (not rolling 7 days).
      const todayD = new Date(); todayD.setHours(0,0,0,0);
      const dow = todayD.getDay();
      const monOff = dow === 0 ? -6 : 1 - dow;
      const monD = new Date(todayD); monD.setDate(todayD.getDate() + monOff);
      // Index ALL planned sessions (incl REST) by their original scheduled date
      // so the strip shows what was planned even if the session was moved.
      const plannedByDate = new Map();
      for (const w of weeksList) {
        for (const s of (w.sessions || [])) {
          if ((s.type || "").toUpperCase() === "REST") continue;
          const sd = sessionDateStr(w.weekStart, s.day);
          if (sd && !plannedByDate.has(sd)) plannedByDate.set(sd, s);
        }
      }
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monD); d.setDate(monD.getDate() + i);
        const dStr = fmtDate(d);
        const isToday = dStr === today;
        const plannedSess = plannedByDate.get(dStr);
        const act = actsByDate.get(dStr);
        const orphanLog = orphanLogsByDate.get(dStr);
        const isLogged = !!act || !!orphanLog;
        let color = C.lightRule;
        let pattern = null;
        if (isLogged) color = "#2a6e27"; // green
        else if (plannedSess && dStr < today) color = "#8b1c1c"; // missed
        else if (plannedSess) {
          const ts = typeStyle(plannedSess.type);
          color = ts.accent;
          pattern = ts.pattern || null;
        }
        days.push({ dStr, isToday, color, pattern, hasPlan: !!plannedSess, isLogged });
      }

      // Replies needed: each athlete-day with content needs at most one reply.
      // Activity is canonical; session_log only adds to the count if no
      // matching activity exists for that date. Read (coach_read_at) items
      // are excluded.
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = fmtDate(cutoff);
      const datesNeedingReply = new Set();
      for (const a of myActs) {
        if (a.activity_date >= cutoffStr && !a.coach_reply && !a.coach_read_at) datesNeedingReply.add(a.activity_date);
      }
      for (const w of weeksList) {
        for (const s of (w.sessions || [])) {
          const log = logs[s.id];
          if (!log || !log.feedback) continue;
          const onDate = log?.analysis?.actual_date || sessionDateStr(w.weekStart, s.day);
          if (onDate < cutoffStr) continue;
          const linkedAct = actsByDate.get(onDate);
          const replied = linkedAct?.coach_reply || log.coach_reply;
          const read = linkedAct?.coach_read_at || log.coach_read_at;
          if (!replied && !read) datesNeedingReply.add(onDate);
        }
      }
      const repliesNeeded = datesNeedingReply.size;

      const lastDay = days[days.length-1];
      const last3 = days.slice(-3);
      const behind = last3.filter(d => d.hasPlan && !d.isLogged && d.dStr < today).length >= 2;
      const activeToday = lastDay.isLogged;

      return { email, data, days, repliesNeeded, behind, activeToday };
    });

    const filteredRows = athleteRows.filter(r => {
      if (coachFilter === "all") return true;
      if (coachFilter === "behind") return r.behind;
      if (coachFilter === "replies") return r.repliesNeeded > 0;
      if (coachFilter === "active") return r.activeToday;
      return true;
    });

    const totalReplies = athleteRows.reduce((a, r) => a + r.repliesNeeded, 0);
    const logsToday = Object.values(logs).filter(l => l.updated_at?.startsWith(today)).length
                    + activities.filter(a => a.activity_date === today).length;

    // ── Desktop right-panel: pre-compute athlete week data ──────────────────
    const dpAthlete   = isDesktop && dashAthlete ? (athletePrograms[dashAthlete] || { weeks:[] }) : null;
    const dpStats     = isDesktop && dashAthlete ? statsFor(dashAthlete) : null;
    const dpWeekKm    = isDesktop && dashAthlete ? weekKm(activities, dashAthlete, 0) : 0;
    const dpName      = dpAthlete ? (dpAthlete.name  || prettyEmailName(dashAthlete)) : null;
    const dpGoal      = dpAthlete ? (dpAthlete.goal  || "—") : null;
    const dpActs      = isDesktop && dashAthlete ? (activitiesByEmail.get(dashAthlete.toLowerCase()) || []) : [];
    const dpActByDate = {};
    for (const a of dpActs) if (a.source === "session") dpActByDate[a.activity_date] = a;
    const dpWk = dpAthlete && coachActiveMonday
      ? (dpAthlete.weeks.find(w => w.weekStart === coachActiveMonday) || { weekStart: coachActiveMonday, sessions:[] })
      : null;
    const dpWkEnd  = dpWk ? weekEndStr(dpWk.weekStart) : null;
    const dpExtras = dpWk ? dpActs.filter(a => a.source !== "session" && a.activity_date >= dpWk.weekStart && a.activity_date <= dpWkEnd) : [];
    const dpSnapMonday = (dateStr) => {
      if (!dateStr) return;
      const d = new Date(dateStr + "T00:00:00");
      if (isNaN(d)) return;
      const dow = d.getDay();
      d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
      setCoachActiveMonday(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    };

    // Shared roster content — rendered in the left sidebar (desktop) or full page (mobile)
    const rosterContent = (
      <>
        {/* Summary strip */}
        <div style={{ display:"flex", gap:10, marginBottom:20 }}>
          <div style={S.statBox}>
            <div style={{ fontSize:22, fontWeight:900, color:C.navy }}>{athletes.length}</div>
            <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>Athletes</div>
          </div>
          <div style={S.statBox}>
            <div style={{ fontSize:22, fontWeight:900, color:C.navy }}>{logsToday}</div>
            <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>Today's Logs</div>
          </div>
          <div style={S.statBox}>
            <div style={{ fontSize:22, fontWeight:900, color: totalReplies > 0 ? C.crimson : C.navy }}>{totalReplies}</div>
            <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>Replies Due</div>
          </div>
        </div>

        {/* Tools */}
        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          <button onClick={() => setCoachScreen("inbox")}
            style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"10px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer", position:"relative" }}>
            REPLY INBOX
            {totalReplies > 0 && <span style={{ position:"absolute", top:-6, right:-6, background:C.crimson, color:C.white, borderRadius:"50%", minWidth:18, height:18, fontSize:10, display:"inline-flex", alignItems:"center", justifyContent:"center", padding:"0 5px", fontWeight:700 }}>{totalReplies}</span>}
          </button>
          <button onClick={() => setCoachScreen("templates")}
            style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"10px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer" }}>
            TEMPLATES
          </button>
          <button onClick={() => setCoachScreen("plan-builder")}
            style={{ flex:1, background:"#1a2744", border:"1px solid #2a3a5c", borderRadius:2, padding:"10px", fontSize:11, letterSpacing:2, color:"#e8dcc8", fontWeight:700, cursor:"pointer" }}>
            PLAN BUILDER
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
          {[
            { k:"all",     label:`All · ${athletes.length}` },
            { k:"active",  label:`Active today · ${athleteRows.filter(r=>r.activeToday).length}` },
            { k:"behind",  label:`Behind · ${athleteRows.filter(r=>r.behind).length}` },
            { k:"replies", label:`Replies · ${totalReplies}` },
          ].map(f => (
            <button key={f.k} onClick={()=>setCoachFilter(f.k)}
              style={{
                background: coachFilter === f.k ? C.navy : "transparent",
                color: coachFilter === f.k ? C.cream : C.mid,
                border:`1px solid ${coachFilter === f.k ? C.navy : C.rule}`,
                borderRadius:99, padding:"6px 12px", fontSize:10, letterSpacing:1.5, fontWeight:700, cursor:"pointer", textTransform:"uppercase"
              }}>{f.label}</button>
          ))}
        </div>

        {/* Athlete rows */}
        {filteredRows.length === 0 ? (
          <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"24px", textAlign:"center", fontSize:12, color:C.mid }}>
            No athletes match this filter.
          </div>
        ) : filteredRows.map(({ email, data, days, repliesNeeded }) => {
          const displayName = data.name || prettyEmailName(email);
          const avatar = data.avatar || displayName.slice(0, 2).toUpperCase();
          const goalText = fmtPbGoal(data.goals) || data.goal || "—";
          const isSelected = isDesktop && dashAthlete === email;
          return (
            <div key={email} onClick={() => {
              setDashAthlete(email);
              if (!isDesktop) setCoachScreen("athlete");
            }}
              style={{ ...S.card, marginBottom:10, cursor:"pointer", padding:"14px 16px",
                ...(isSelected ? { borderColor:C.navy, boxShadow:`0 0 0 1.5px ${C.navy}` } : {}) }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:C.navy, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:12, flexShrink:0, color:C.cream }}>
                  {avatar}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:C.navy, fontFamily:S.displayFont, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayName}</div>
                    {repliesNeeded > 0 && <span style={{ background:C.crimson, color:C.white, borderRadius:99, padding:"1px 7px", fontSize:9, fontWeight:700, letterSpacing:0.5 }}>{repliesNeeded}</span>}
                  </div>
                  <div style={{ fontSize:11, color:C.mid, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{goalText}</div>
                </div>
                {!isDesktop && <div style={{ color:C.mid, fontSize:18, flexShrink:0 }}>›</div>}
              </div>
              <div style={{ display:"flex", gap:5, marginTop:12, paddingLeft:50 }}>
                {days.map((d, i) => (
                  <div key={i} title={d.dStr} style={{
                    flex:1, height:8, borderRadius:2, background: d.pattern || d.color,
                    border: d.isToday ? `2px solid ${C.navy}` : "none",
                    boxSizing: d.isToday ? "border-box" : "content-box"
                  }}/>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );

    return (
      <div style={{ ...S.page, ...(isDesktop ? { display:"flex", flexDirection:"column", height:"100vh", overflow:"hidden" } : {}) }}>
        <div style={S.grain}/>
        <Header
          title="Athletes"
          subtitle={user.user_metadata?.full_name || user.email}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />

        {isDesktop ? (
          /* ── DESKTOP: sidebar + right panel ── */
          <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

            {/* Left sidebar — roster */}
            <div style={{ width:308, flexShrink:0, borderRight:`1px solid ${C.rule}`, overflowY:"auto", padding:"20px 16px 80px", background:C.white }}>
              {rosterContent}
            </div>

            {/* Right panel — athlete week detail */}
            <div style={{ flex:1, overflowY:"auto", background:C.cream, padding:"28px 36px 80px" }}>
              {!dpAthlete ? (
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60%", flexDirection:"column", gap:16, color:C.mid }}>
                  <div style={{ fontSize:48, opacity:0.2, fontFamily:S.displayFont }}>←</div>
                  <div style={{ fontSize:16, fontFamily:S.displayFont, color:C.navy }}>Select an athlete</div>
                  <div style={{ fontSize:13 }}>Their training week will appear here</div>
                </div>
              ) : (
                <>
                  {/* Athlete header */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22 }}>
                    <div>
                      <div style={{ fontSize:28, fontWeight:900, color:C.navy, fontFamily:S.displayFont, marginBottom:3 }}>{dpName}</div>
                      <div style={{ fontSize:13, color:C.mid }}>{dpGoal}</div>
                    </div>
                    <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                      <button onClick={() => setCoachScreen("profile")} style={S.signOutBtn}>Edit profile</button>
                      <button onClick={() => setCoachScreen("athlete")} style={{ ...S.signOutBtn, color:C.navy, borderColor:C.navy, fontWeight:700 }}>Full view ›</button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{ display:"flex", gap:10, marginBottom:22 }}>
                    {[
                      { label:"Compliance", val:`${dpStats.rate}%`, color: dpStats.rate>75?C.green:dpStats.rate>40?C.amber:C.crimson },
                      { label:"Completed",  val: dpStats.done,      color:C.green },
                      { label:"Missed",     val: dpStats.missed,    color: dpStats.missed>0?C.crimson:C.mid },
                      { label:"Km This Wk", val:`${dpWeekKm.toFixed(1)}`, color:C.navy },
                    ].map((s,i) => (
                      <div key={i} style={S.statBox}>
                        <div style={{ fontSize:22, fontWeight:900, color:s.color||C.navy }}>{s.val}</div>
                        <div style={{ fontSize:9, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Week picker */}
                  {coachActiveMonday && (() => {
                    const monD = new Date(coachActiveMonday + "T00:00:00");
                    const sunD = new Date(monD); sunD.setDate(monD.getDate() + 6); sunD.setHours(23,59,59,999);
                    const isCurr = new Date() >= monD && new Date() <= sunD;
                    return (
                      <div style={{ marginBottom:22 }}>
                        <input type="date" value={coachActiveMonday}
                          onChange={e => dpSnapMonday(e.target.value)}
                          style={{ ...S.input, background:isCurr?C.crimson:C.white, color:isCurr?"#fffdf8":C.navy, border:`1px solid ${isCurr?"#E06666":C.rule}`, fontWeight:700, letterSpacing:0.5, fontFamily:S.bodyFont, cursor:"pointer", colorScheme:isCurr?"dark":"light", maxWidth:280 }}/>
                        <div style={{ fontSize:10, color:C.mid, marginTop:6, paddingLeft:2, letterSpacing:1 }}>
                          {isCurr ? "THIS WEEK" : new Date() > sunD ? "PAST" : "UPCOMING"}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2-column session grid */}
                  {dpWk && (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      {DAY_LABELS.map(dayLabel => {
                        const dayDate = sessionDateStr(dpWk.weekStart, dayLabel);
                        const isToday = dayDate === todayStr();
                        const sessionsHere = (dpWk.sessions || []).filter(s => {
                          const override = logs[s.id]?.analysis?.actual_date;
                          if (override && dayDate) return override === dayDate;
                          return s.day?.slice(0,3) === dayLabel;
                        });
                        const extrasHere = dayDate ? dpExtras.filter(a => a.activity_date === dayDate) : [];
                        const datePart = dayDate ? dayDate.slice(5).replace("-","/") : "";
                        return (
                          <div key={dayLabel} style={{ background:C.white, border:`1px solid ${isToday ? C.crimson : C.rule}`, borderRadius:2, padding:"12px 14px" }}>
                            <div style={{ fontSize:10, letterSpacing:2, color:isToday?C.crimson:C.mid, fontWeight:isToday?700:500, marginBottom:8 }}>
                              {dayLabel.toUpperCase()}{datePart ? ` · ${datePart}` : ""}{isToday ? " · TODAY" : ""}
                            </div>
                            {sessionsHere.length === 0 && extrasHere.length === 0 ? (
                              <div style={{ fontSize:11, color:C.mid, fontStyle:"italic" }}>Rest</div>
                            ) : (
                              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                                {sessionsHere.map(s => {
                                  const log = logs[s.id];
                                  const sDate = log?.analysis?.actual_date || sessionDateStr(dpWk.weekStart, s.day);
                                  const linkedAct = dpActByDate[sDate];
                                  const isPastDate = sDate && sDate < todayStr();
                                  const comply = log?.analysis?.compliance || (linkedAct ? "completed" : isPastDate && (s.type||"").toUpperCase() !== "REST" ? "missed" : "pending");
                                  const cts = typeStyle(s.type);
                                  return (
                                    <div key={s.id}
                                      onClick={() => { setActiveSession({...s, weekStart:dpWk.weekStart, athleteEmail:dashAthlete}); setCoachScreen("session"); }}
                                      style={{ background:cts.bg, border:`1px solid ${cts.border}`, borderLeft:`3px solid ${cts.accent}`, borderRadius:2, padding:"8px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                                      <div style={{ width:22, height:22, borderRadius:"50%", background:cts.pattern||cts.bg, border:`1.5px solid ${cts.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:cts.accent, fontWeight:700, flexShrink:0 }}>
                                        {cts.pattern ? "" : (s.type||"").slice(0,1).toUpperCase()}
                                      </div>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                                          <div style={{ fontWeight:700, fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.type}</div>
                                          <div style={{ fontSize:9, color:COMPLY_COLOR[comply], fontWeight:700 }}>
                                            {comply==="completed"?"✓":comply==="missed"?"✗":comply==="partial"?"~":""}
                                          </div>
                                        </div>
                                        {s.pace && <div style={{ fontSize:10, color:cts.accent, fontFamily:"monospace" }}>{s.pace}</div>}
                                        {log?.analysis?.distance_km && <div style={{ fontSize:10, color:C.mid }}>{log.analysis.distance_km}km{log.analysis.duration_min ? ` · ${log.analysis.duration_min}min` : ""}</div>}
                                      </div>
                                    </div>
                                  );
                                })}
                                {extrasHere.map(act => (
                                  <div key={act.id}
                                    onClick={() => { setActiveExtraActivity(act); setCoachScreen("extra-activity"); }}
                                    style={{ background:"#fdf0f0", border:`1px solid ${C.rule}`, borderLeft:`3px solid ${C.crimson}`, borderRadius:2, padding:"8px 10px", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
                                    <div style={{ fontSize:12 }}>➕</div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ fontWeight:700, fontSize:12, color:C.navy }}>{act.activity_type || "Run"}</div>
                                      <div style={{ fontSize:10, color:C.mid }}>{act.distance_km}km</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── MOBILE: single column ── */
          <div style={{ maxWidth: isDesktop ? 800 : 520, margin:"0 auto", padding:"24px 16px 80px" }}>
            {rosterContent}
          </div>
        )}
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → PLAN BUILDER
  // ────────────────────────────────────────────────────────────
  // Throws on error so the Plan Builder's inline banner can surface the message.
  // Upsert a single session into an athlete's weeks. weekStart is the Monday;
  // a new week is appended (and inserted in chronological order) if needed.
  const saveWorkout = async (athleteEmail, weekStart, sessionData, sessionId = null) => {
    const key = athleteEmail?.toLowerCase();
    const meta = athletePrograms[key] || {};
    const existingWeeks = (meta.weeks || []).map(w => ({ ...w, sessions: [...(w.sessions || [])] }));
    let week = existingWeeks.find(w => w.weekStart === weekStart);
    if (!week) {
      const m = new Date(weekStart + "T00:00:00");
      const sun = new Date(m); sun.setDate(m.getDate() + 6);
      const monthLabel = m.toLocaleString("en-AU", { month: "short" });
      const sunMonthLabel = sun.toLocaleString("en-AU", { month: "short" });
      const weekLabel = monthLabel === sunMonthLabel
        ? `Week of ${m.getDate()}–${sun.getDate()} ${monthLabel}`
        : `Week of ${m.getDate()} ${monthLabel} – ${sun.getDate()} ${sunMonthLabel}`;
      week = { weekStart, weekLabel, sessions: [] };
      existingWeeks.push(week);
      existingWeeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    }
    if (sessionId) {
      const idx = week.sessions.findIndex(s => s.id === sessionId);
      if (idx >= 0) week.sessions[idx] = { ...week.sessions[idx], ...sessionData };
    } else {
      week.sessions.push({ id: newId(), ...sessionData });
    }
    await handleSavePlan(athleteEmail, existingWeeks, { name: meta.name, goal: meta.goal, current: meta.current });
  };

  const deleteWorkout = async (athleteEmail, weekStart, sessionId) => {
    const key = athleteEmail?.toLowerCase();
    const meta = athletePrograms[key] || {};
    const nextWeeks = (meta.weeks || []).map(w => {
      if (w.weekStart !== weekStart) return w;
      return { ...w, sessions: (w.sessions || []).filter(s => s.id !== sessionId) };
    });
    await handleSavePlan(athleteEmail, nextWeeks, { name: meta.name, goal: meta.goal, current: meta.current });
  };

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
      const existingWeeks = normalizePlan(existing?.plan_json).weeks;
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

  if (role === "coach" && coachScreen === "inbox") {
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = fmtDate(cutoff);

    // Build inbox items: one row per athlete-day. Activity is canonical; if a
    // session_log + activity both exist for the same date, the session item wins.
    const items = [];
    const seen = new Set(); // key: email|date
    for (const [email, data] of Object.entries(athletePrograms)) {
      const weeksList = Array.isArray(data.weeks) ? data.weeks : [];
      const sessionsById = {};
      for (const w of weeksList) for (const s of (w.sessions || [])) sessionsById[s.id] = { ...s, weekStart: w.weekStart };
      const myActsByDate = new Map();
      for (const a of activities) if (a.athlete_email?.toLowerCase() === email.toLowerCase()) myActsByDate.set(a.activity_date, a);
      for (const log of Object.values(logs)) {
        if (log.athlete_email?.toLowerCase() !== email.toLowerCase()) continue;
        if (!log.feedback) continue;
        const sess = sessionsById[log.session_id];
        if (!sess) continue;
        const onDate = log.analysis?.actual_date || sessionDateStr(sess.weekStart, sess.day);
        if (onDate < cutoffStr) continue;
        const linkedAct = myActsByDate.get(onDate);
        if ((linkedAct?.coach_reply) || log.coach_reply) continue;
        if ((linkedAct?.coach_read_at) || log.coach_read_at) continue;
        items.push({ kind:"session", date: onDate, email, athleteName: data.name || prettyEmailName(email), title: sess.type, snippet: log.feedback, sess, log, linkedAct });
        seen.add(`${email}|${onDate}`);
      }
    }
    for (const a of activities) {
      if (a.coach_reply || a.coach_read_at) continue;
      if (a.activity_date < cutoffStr) continue;
      const data = athletePrograms[a.athlete_email?.toLowerCase()];
      if (!data) continue;
      const key = `${a.athlete_email?.toLowerCase()}|${a.activity_date}`;
      if (seen.has(key)) continue;
      items.push({ kind:"activity", date: a.activity_date, email: a.athlete_email, athleteName: data.name || prettyEmailName(a.athlete_email), title: a.activity_type || "Run", snippet: a.notes || `${a.distance_km}km`, act: a });
      seen.add(key);
    }
    items.sort((a, b) => b.date.localeCompare(a.date));

    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title="Reply Inbox" subtitle={`${items.length} awaiting reply`} onBack={() => setCoachScreen("dashboard")} />
        <div style={{ maxWidth: isDesktop ? 800 : 520, margin:"0 auto", padding:"24px 16px 80px" }}>
          {items.length > 0 && (
            <button onClick={async () => {
              if (!confirm(`Mark all ${items.length} comment${items.length === 1 ? "" : "s"} as read?`)) return;
              const ts = new Date().toISOString();
              const actIds = items.filter(it => it.kind === "activity").map(it => it.act.id)
                .concat(items.filter(it => it.linkedAct?.id).map(it => it.linkedAct.id));
              const sessionIds = items.filter(it => it.kind === "session").map(it => it.log.session_id);
              const updates = [];
              if (actIds.length) {
                updates.push(supabase.from("activities").update({ coach_read_at: ts }).in("id", actIds).select());
              }
              if (sessionIds.length) {
                updates.push(supabase.from("session_logs").update({ coach_read_at: ts }).in("session_id", sessionIds).select());
              }
              const results = await Promise.all(updates);
              for (const r of results) {
                if (r.error) { alert("Mark-as-read failed: " + r.error.message); return; }
              }
              // Refresh local state from results
              if (actIds.length) {
                const updated = results[0].data || [];
                setActivities(prev => prev.map(a => updated.find(u => u.id === a.id) || a));
              }
              if (sessionIds.length) {
                const idx = actIds.length ? 1 : 0;
                const updated = results[idx].data || [];
                setLogs(prev => {
                  const next = { ...prev };
                  for (const u of updated) next[u.session_id] = u;
                  return next;
                });
              }
            }}
              style={{ width:"100%", marginBottom:14, background:C.navy, color:C.cream, border:0, borderRadius:2, padding:"12px", fontSize:11, letterSpacing:2, fontWeight:700, cursor:"pointer" }}>
              ✓ MARK ALL AS READ
            </button>
          )}
          {items.length === 0 ? (
            <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"32px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:900, color:C.navy, fontFamily:S.displayFont, marginBottom:6 }}>Inbox zero.</div>
              <div style={{ fontSize:12, color:C.mid }}>No athlete logs awaiting your reply.</div>
            </div>
          ) : items.map((it, i) => (
            <div key={i}
              style={{ ...S.card, marginBottom:10, padding:"14px 16px", display:"flex", gap:10, alignItems:"flex-start" }}>
              <div onClick={() => {
                  setDashAthlete(it.email);
                  if (it.kind === "session") {
                    setActiveSession({ ...it.sess, athleteEmail: it.email });
                    setCoachScreen("session");
                  } else {
                    setActiveExtraActivity(it.act);
                    setCoachScreen("extra-activity");
                  }
                }} style={{ flex:1, cursor:"pointer", minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.navy, fontFamily:S.displayFont }}>{it.athleteName}</div>
                  <div style={{ fontSize:10, color:C.mid, letterSpacing:1 }}>{it.date.slice(5).replace("-", "/")}</div>
                </div>
                <div style={{ fontSize:12, color: it.kind === "activity" ? C.crimson : C.mid, letterSpacing:1, marginBottom:6, fontWeight: it.kind === "activity" ? 700 : 500 }}>
                  {it.kind === "activity" ? "EXTRA · " : ""}{it.title.toUpperCase()}
                </div>
                <div style={{ fontSize:13, color:C.navy, lineHeight:1.45, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                  {it.snippet}
                </div>
              </div>
              <button onClick={async (e) => {
                  e.stopPropagation();
                  const ts = new Date().toISOString();
                  if (it.kind === "activity") {
                    const { data, error } = await supabase.from("activities").update({ coach_read_at: ts }).eq("id", it.act.id).select().single();
                    if (error) { alert("Mark read failed: " + error.message); return; }
                    if (data) setActivities(prev => prev.map(a => a.id === data.id ? data : a));
                  } else {
                    const { data, error } = await supabase.from("session_logs").update({ coach_read_at: ts }).eq("session_id", it.log.session_id).select().single();
                    if (error) { alert("Mark read failed: " + error.message); return; }
                    if (data) setLogs(prev => ({ ...prev, [data.session_id]: data }));
                    if (it.linkedAct?.id) {
                      await supabase.from("activities").update({ coach_read_at: ts }).eq("id", it.linkedAct.id);
                    }
                  }
                }}
                title="Mark as read"
                style={{ background:"transparent", border:`1px solid ${C.rule}`, borderRadius:2, padding:"4px 8px", color:C.mid, fontSize:10, letterSpacing:1, fontWeight:700, cursor:"pointer", flexShrink:0 }}>
                ✓ READ
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (role === "coach" && coachScreen === "templates") {
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title="Workout Templates" subtitle={`${workoutTemplates.length} saved`} onBack={() => setCoachScreen("dashboard")} />
        <div style={{ maxWidth: isDesktop ? 800 : 520, margin:"0 auto", padding:"24px 16px 80px" }}>
          {workoutTemplates.length === 0 ? (
            <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"32px", textAlign:"center" }}>
              <div style={{ fontSize:16, fontWeight:900, color:C.navy, fontFamily:S.displayFont, marginBottom:6 }}>No templates yet.</div>
              <div style={{ fontSize:12, color:C.mid, lineHeight:1.5 }}>When editing a workout, hit "Save as template" to reuse it on any athlete's plan.</div>
            </div>
          ) : workoutTemplates.map(t => (
            <div key={t.id} style={{ ...S.card, marginBottom:10, padding:"14px 16px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:10, letterSpacing:2, color:typeStyle(t.type).accent, fontWeight:700, marginBottom:4 }}>{(t.type || t.tag || "").toUpperCase()}</div>
                  <div style={{ fontWeight:700, fontSize:15, color:C.navy, fontFamily:S.displayFont, marginBottom:4 }}>{t.name}</div>
                  {t.description && <div style={{ fontSize:12, color:C.mid, lineHeight:1.5, marginBottom:4 }}>{t.description}</div>}
                  {t.pace && <div style={{ fontSize:11, color:C.mid, fontFamily:"monospace" }}>{t.pace}{t.terrain ? ` · ${t.terrain}` : ""}</div>}
                </div>
                <button onClick={async () => {
                  if (!confirm("Delete this template?")) return;
                  const { error } = await supabase.from("workout_templates").delete().eq("id", t.id);
                  if (!error) setWorkoutTemplates(prev => prev.filter(x => x.id !== t.id));
                }} style={{ background:"transparent", border:0, color:C.crimson, fontSize:11, letterSpacing:1, cursor:"pointer", fontWeight:700 }}>DELETE</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
  //  PROFILE EDITOR — shared renderer for athlete-self and coach-edit-on-behalf
  // ────────────────────────────────────────────────────────────
  const renderProfileScreen = ({ title, subtitle, email, onBack, headerRight }) => (
    <div style={S.page}>
      <div style={S.grain}/>
      <Header title={title} subtitle={subtitle} onBack={onBack} right={headerRight} />
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "24px 16px 80px" }}>
        <ProfileForm form={profileForm} setForm={setProfileForm} email={email} />
        {profileStatus && (
          <div style={{ marginBottom: 12, padding: "10px 12px", fontSize: 13, borderRadius: 2,
            background: profileStatus.kind === "error" ? "#fdf0f0" : "#eef6ec",
            color:      profileStatus.kind === "error" ? C.crimson : C.green,
            border: `1px solid ${profileStatus.kind === "error" ? C.crimson : C.green}` }}>
            {profileStatus.message}
          </div>
        )}
        <button onClick={() => handleSaveProfile(email)} disabled={profileSaving}
          style={S.primaryBtn(C.crimson, profileSaving)}>
          {profileSaving ? "Saving…" : "Save profile"}
        </button>
      </div>
    </div>
  );

  if (role === "coach" && coachScreen === "profile" && dashAthlete) {
    const ap = athletePrograms[dashAthlete] || {};
    return renderProfileScreen({
      title: `Edit ${ap.name || prettyEmailName(dashAthlete)}`,
      subtitle: dashAthlete,
      email: dashAthlete,
      onBack: () => setCoachScreen("athlete"),
    });
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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"24px 16px 80px" }}>

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

          {coachActiveMonday && (() => {
            const athActs = activitiesByEmail.get(dashAthlete?.toLowerCase()) || [];
            const today = new Date(); today.setHours(0,0,0,0);
            const monDate = new Date(coachActiveMonday + "T00:00:00");
            const sunDate = new Date(monDate); sunDate.setDate(monDate.getDate() + 6); sunDate.setHours(23,59,59,999);
            const isCurrent = today >= monDate && today <= sunDate;
            const isPast = today > sunDate;
            const planned = da.weeks.find(w => w.weekStart === coachActiveMonday);
            const fmtRange = () => {
              const m = monDate.toLocaleString("en-AU", { month: "short" });
              const m2 = sunDate.toLocaleString("en-AU", { month: "short" });
              return m === m2
                ? `${monDate.getDate()}–${sunDate.getDate()} ${m}`
                : `${monDate.getDate()} ${m} – ${sunDate.getDate()} ${m2}`;
            };
            const wk = planned || { weekStart: coachActiveMonday, weekLabel: fmtRange(), sessions: [] };
            const wkEnd = weekEndStr(wk.weekStart);
            const extraActs = athActs.filter(a => a.source !== "session" && a.activity_date >= wk.weekStart && a.activity_date <= wkEnd);
            const actByDate = {};
            for (const a of athActs) if (a.source === "session") actByDate[a.activity_date] = a;

            const snapCoachMonday = (dateStr) => {
              const mon = snapToMonday(dateStr);
              if (mon) setCoachActiveMonday(mon);
            };

            return (
              <>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:6, fontFamily:S.bodyFont }}>Week of</div>
                  <input
                    type="date"
                    value={coachActiveMonday}
                    onChange={(e) => snapCoachMonday(e.target.value)}
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
                    {wk.weekLabel}{isCurrent ? " · THIS WEEK" : isPast ? " · PAST" : " · UPCOMING"}
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  {DAY_LABELS.map(dayLabel => {
                    const dayDate = sessionDateStr(wk.weekStart, dayLabel);
                    const isToday = dayDate === todayStr();
                    const sessionsHere = (wk.sessions || []).filter(s => {
                      const overrideDate = logs[s.id]?.analysis?.actual_date;
                      if (overrideDate && dayDate) return overrideDate === dayDate;
                      return s.day?.slice(0, 3) === dayLabel;
                    });
                    const extrasHere = dayDate ? extraActs.filter(a => a.activity_date === dayDate) : [];
                    const datePart = dayDate ? dayDate.slice(5).replace("-", "/") : "";
                    return (
                      <div key={dayLabel} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize:10, letterSpacing:2, color: isToday ? C.crimson : C.mid, fontWeight: isToday ? 700 : 500, marginBottom:4, paddingLeft:2 }}>
                          {dayLabel.toUpperCase()}{datePart ? ` · ${datePart}` : ""}{isToday ? " · TODAY" : ""}
                        </div>
                        {sessionsHere.length === 0 && extrasHere.length === 0 ? (
                          <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"12px", fontSize:11, color:C.mid, textAlign:"center", letterSpacing:1 }}>NO WORKOUT</div>
                        ) : (
                          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                            {sessionsHere.map(s => {
                              const log    = logs[s.id];
                              const sDate  = log?.analysis?.actual_date || sessionDateStr(wk.weekStart, s.day);
                              const linkedAct = actByDate[sDate];
                              const isPastDate = sDate && sDate < todayStr();
                              const comply = log?.analysis?.compliance
                                || (linkedAct ? "completed"
                                  : isPastDate && (s.type || "").toUpperCase() !== "REST" ? "missed"
                                  : "pending");
                              const cts = typeStyle(s.type);
                              return (
                                <div key={s.id}
                                  onClick={()=>{ const sess = {...s, weekStart: wk.weekStart, athleteEmail: dashAthlete}; setActiveSession(sess); setCoachScreen("session"); }}
                                  style={{ ...S.card, padding:"10px 12px", cursor:"pointer", display:"flex", alignItems:"center", gap:10, borderLeft:`4px solid ${cts.accent}` }}>
                                  <div style={{
                                    width:28, height:28, borderRadius:"50%",
                                    background: cts.pattern || cts.bg,
                                    border:`1.5px solid ${cts.accent}`,
                                    display:"flex", alignItems:"center", justifyContent:"center",
                                    fontSize:11, color:cts.accent, fontWeight:700, flexShrink:0,
                                  }}>{cts.pattern ? "" : (s.type || "").slice(0,1).toUpperCase()}</div>
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                                      <div style={{ fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.type}</div>
                                      <div style={{ fontSize:10, color: COMPLY_COLOR[comply], fontWeight:700, flexShrink:0 }}>{COMPLY_LABEL[comply]}</div>
                                    </div>
                                    {log?.analysis?.distance_km && (
                                      <div style={{ fontSize:11, color:C.mid, marginTop:2 }}>{log.analysis.distance_km}km{log.analysis.duration_min ? ` · ${log.analysis.duration_min}min` : ""}</div>
                                    )}
                                    {log?.analysis?.actual_date && s.day && (
                                      <div style={{ fontSize:9, color:C.crimson, marginTop:2, letterSpacing:1, fontWeight:600 }}>↪ MOVED FROM {s.day.slice(0,3).toUpperCase()}</div>
                                    )}
                                    {log?.coach_reply && <div style={{ fontSize:10, color:"#14365f", marginTop:2 }}>💬 You replied</div>}
                                  </div>
                                </div>
                              );
                            })}
                            {extrasHere.map(act => (
                              <div key={act.id} onClick={()=>{ setActiveExtraActivity(act); setCoachScreen("extra-activity"); }}
                                style={{ ...S.card, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, background:"#fdf0f0", borderLeft:`3px solid ${C.crimson}`, cursor:"pointer" }}>
                                <div style={{ fontSize:18 }}>➕</div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
                                    <div style={{ fontWeight:700, fontSize:14, color:C.navy }}>{act.activity_type || "Run"}</div>
                                    <div style={{ fontSize:10, color:C.crimson, flexShrink:0 }}>EXTRA</div>
                                  </div>
                                  <div style={{ fontSize:11, color:C.mid, marginTop:2 }}>
                                    {act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds/60)}min` : ""}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {dayDate && (
                          <button onClick={() => { setEditingWorkout({ weekStart: wk.weekStart, dayLabel, sessionId: null, athleteEmail: dashAthlete, prefill: null }); setCoachScreen("edit-workout"); }}
                            style={{ marginTop:6, width:"100%", background:"transparent", border:`1px dashed ${C.rule}`, borderRadius:2, padding:"6px 10px", color:C.mid, fontSize:10, letterSpacing:2, cursor:"pointer" }}>
                            + ADD WORKOUT
                          </button>
                        )}
                      </div>
                    );
                  })}
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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"24px 16px 80px" }}>

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
                  {an?.wellness && Object.keys(an.wellness).length > 0 && (
                    <SectionCard label="Wellness">
                      <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:13, color:C.navy }}>
                        {an.wellness.rpe        != null && <div><b>RPE</b> {an.wellness.rpe}/10</div>}
                        {an.wellness.sleep_hours != null && <div><b>Sleep</b> {an.wellness.sleep_hours}h</div>}
                        {an.wellness.soreness   != null && <div><b>Soreness</b> {an.wellness.soreness}/5</div>}
                        {an.wellness.mood       != null && <div><b>Mood</b> {["😞","😕","😐","🙂","😄"][an.wellness.mood-1]} {an.wellness.mood}/5</div>}
                      </div>
                    </SectionCard>
                  )}
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

              <SectionCard label="Edit logged run">
                {(() => {
                  const refId = `${activeSession.id}|${linkedAthAct?.id || "log"}`;
                  const draft = coachEditLog?.id === refId ? coachEditLog : {
                    id: refId,
                    date: linkedAthAct?.activity_date || an?.actual_date || coachSDate || "",
                    distance: (linkedAthAct?.distance_km ?? an?.distance_km) != null ? String(linkedAthAct?.distance_km ?? an?.distance_km) : "",
                    duration: linkedAthAct?.duration_seconds != null ? String(Math.round(linkedAthAct.duration_seconds / 60))
                              : (an?.duration_min != null ? String(an.duration_min) : ""),
                  };
                  return (
                    <>
                      <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                        <div style={{ flex:1.2 }}>
                          <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DATE</div>
                          <input type="date" value={draft.date} onChange={e => setCoachEditLog({ ...draft, date: e.target.value })} style={S.input}/>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DIST (km)</div>
                          <input value={draft.distance} onChange={e => setCoachEditLog({ ...draft, distance: e.target.value })} style={S.input}/>
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DURATION (min)</div>
                          <input value={draft.duration} onChange={e => setCoachEditLog({ ...draft, duration: e.target.value })} style={S.input}/>
                        </div>
                      </div>
                      <button onClick={async () => {
                        const dist = draft.distance ? parseFloat(draft.distance) : null;
                        const durMin = draft.duration ? parseFloat(draft.duration) : null;
                        // Update the linked activity if present.
                        if (linkedAthAct?.id) {
                          const { data, error } = await supabase.from("activities").update({
                            activity_date: draft.date,
                            distance_km: dist,
                            duration_seconds: durMin != null ? Math.round(durMin * 60) : null,
                          }).eq("id", linkedAthAct.id).select().single();
                          if (error) { alert("Activity save failed: " + error.message); return; }
                          if (data) setActivities(prev => prev.map(a => a.id === data.id ? data : a));
                        }
                        // Update session_log analysis fields.
                        if (log) {
                          const nextAnalysis = {
                            ...(an || {}),
                            distance_km: dist,
                            duration_min: durMin,
                            ...(draft.date && draft.date !== coachSDate ? { actual_date: draft.date } : {}),
                          };
                          if (draft.date === coachSDate) delete nextAnalysis.actual_date;
                          try { await saveLog(activeSession.id, { analysis: nextAnalysis }); }
                          catch (e) { alert("Log save failed: " + e.message); return; }
                        }
                        setCoachEditLog(null);
                      }} style={S.primaryBtn(C.crimson, false)}>Save changes</button>
                      <button onClick={async () => {
                        if (!confirm("Delete this logged run? The scheduled workout itself stays in the plan.")) return;
                        const ok = await deleteSessionLog(activeSession.id, linkedAthAct?.id);
                        if (ok) setCoachScreen("athlete");
                      }} style={{ ...S.ghostBtn, color:C.crimson, borderColor:C.crimson, marginTop:8 }}>Delete logged run</button>
                    </>
                  );
                })()}
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
                      // Write to both stores: activities is canonical (Strava-first),
                      // session_logs kept populated for backward compatibility.
                      let wroteAnywhere = false;
                      if (linkedAthAct) {
                        const { data: actUpd, error: actErr } = await supabase
                          .from("activities")
                          .update({ coach_reply: coachReply })
                          .eq("id", linkedAthAct.id)
                          .select().maybeSingle();
                        if (actUpd) {
                          setActivities(prev => prev.map(a => a.id === actUpd.id ? actUpd : a));
                          wroteAnywhere = true;
                        } else if (actErr) console.error("activity reply error:", actErr);
                      }
                      const { data: updated, error: updateErr } = await supabase
                        .from("session_logs")
                        .update({ coach_reply: coachReply, updated_at: ts })
                        .eq("session_id", activeSession.id)
                        .select().maybeSingle();
                      if (updated) {
                        setLogs(prev => ({ ...prev, [activeSession.id]: updated }));
                        wroteAnywhere = true;
                      } else if (updateErr) console.error("session_log reply error:", updateErr);
                      if (!wroteAnywhere) {
                        alert("No session log or activity found for this session.");
                        return;
                      }
                      setCoachReply("");
                    }} disabled={!coachReply.trim()} style={S.primaryBtn("#14365f", !coachReply.trim())}>
                      Send Reply →
                    </button>
                  </>
                )}
              </SectionCard>
            </>
          )}
          <button onClick={() => {
            setEditingWorkout({
              weekStart: activeSession.weekStart,
              dayLabel: activeSession.day?.slice(0, 3),
              sessionId: activeSession.id,
              athleteEmail: activeSession.athleteEmail || dashAthlete,
              prefill: { type: activeSession.type, desc: activeSession.desc, pace: activeSession.pace, terrain: activeSession.terrain },
            });
            setCoachScreen("edit-workout");
          }} style={{ ...S.ghostBtn, marginTop:16 }}>✏️ Edit prescribed workout</button>
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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 16px 80px" }}>
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

          <SectionCard label="Edit run">
            {(() => {
              const draft = coachEditAct?.id === act.id ? coachEditAct : {
                id: act.id,
                date: act.activity_date,
                distance: act.distance_km != null ? String(act.distance_km) : "",
                duration: act.duration_seconds != null ? String(Math.round(act.duration_seconds / 60)) : "",
              };
              return (
                <>
                  <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                    <div style={{ flex:1.2 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DATE</div>
                      <input type="date" value={draft.date} onChange={e => setCoachEditAct({ ...draft, date: e.target.value })} style={S.input}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DIST (km)</div>
                      <input value={draft.distance} onChange={e => setCoachEditAct({ ...draft, distance: e.target.value })} style={S.input}/>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:9, letterSpacing:2, color:C.mid, marginBottom:4 }}>DURATION (min)</div>
                      <input value={draft.duration} onChange={e => setCoachEditAct({ ...draft, duration: e.target.value })} style={S.input}/>
                    </div>
                  </div>
                  <button onClick={async () => {
                    const payload = {
                      activity_date: draft.date,
                      distance_km: draft.distance ? parseFloat(draft.distance) : null,
                      duration_seconds: draft.duration ? Math.round(parseFloat(draft.duration) * 60) : null,
                    };
                    const { data, error } = await supabase.from("activities").update(payload).eq("id", act.id).select().single();
                    if (error) { alert("Save failed: " + error.message); return; }
                    if (data) {
                      setActivities(prev => prev.map(a => a.id === data.id ? data : a));
                      setActiveExtraActivity(data);
                      setCoachEditAct(null);
                    }
                  }} style={S.primaryBtn(C.crimson, false)}>Save changes</button>
                </>
              );
            })()}
          </SectionCard>

          <button onClick={async () => {
            if (!confirm("Delete this run?")) return;
            const ok = await deleteActivity(act.id);
            if (ok) { setActiveExtraActivity(null); setCoachScreen("athlete"); }
          }} style={{ ...S.ghostBtn, color:C.crimson, borderColor:C.crimson, marginBottom:8 }}>Delete run</button>
          <button onClick={()=>{ setActiveExtraActivity(null); setCoachScreen("athlete"); }} style={S.ghostBtn}>← Back to athlete</button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  COACH → EDIT / ADD WORKOUT
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "edit-workout" && editingWorkout) {
    const ew = editingWorkout;
    const isNew = !ew.sessionId;
    const f = ew.prefill || {};
    const dayDate = sessionDateStr(ew.weekStart, ew.dayLabel);
    const dayDisplay = dayDate ? `${ew.dayLabel} ${parseInt(dayDate.slice(8), 10)}` : ew.dayLabel;
    const setField = (k, v) => setEditingWorkout(prev => ({ ...prev, prefill: { ...(prev.prefill || {}), [k]: v } }));
    const TYPES = ["EASY", "RECOVERY", "LONG RUN", "TEMPO", "SPEED", "HYROX", "RACE DAY", "REST"];
    const tagFor = (t) => t === "SPEED" ? "speed" : t === "TEMPO" ? "tempo" : "easy";
    const canSave = (f.type || "EASY") && (f.desc || "").trim().length > 0;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={isNew ? "Add Workout" : "Edit Workout"} subtitle={`${ew.athleteEmail} · ${dayDisplay}`} onBack={()=>{ setEditingWorkout(null); setCoachScreen("athlete"); }}/>
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"24px 16px 80px" }}>
          {workoutTemplates.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Apply Template</div>
              <select onChange={(e) => {
                  const tpl = workoutTemplates.find(t => t.id === e.target.value);
                  if (!tpl) return;
                  setEditingWorkout(prev => ({ ...prev, prefill: { ...(prev.prefill || {}), type: tpl.type || "EASY", desc: tpl.description || "", pace: tpl.pace || "", terrain: tpl.terrain || "" } }));
                  e.target.value = "";
                }}
                defaultValue=""
                style={{ ...S.input, width:"100%" }}>
                <option value="" disabled>Choose a saved template…</option>
                {workoutTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} {t.tag ? `· ${t.tag}` : ""}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Type</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {TYPES.map(t => {
                const sel = (f.type || "EASY") === t;
                const tts = typeStyle(t);
                return (
                  <button key={t} type="button" onClick={() => setField("type", t)}
                    style={{
                      background: sel ? (tts.pattern || tts.accent) : C.white,
                      border: `1px solid ${sel ? tts.accent : C.rule}`,
                      borderRadius: 2,
                      padding: "6px 12px",
                      color: sel ? (tts.pattern ? tts.accent : "#fffdf8") : tts.accent,
                      fontSize: 12, cursor: "pointer", letterSpacing: 1,
                      fontWeight: sel ? 700 : 500,
                      textShadow: sel && tts.pattern ? "0 0 3px #fff, 0 0 3px #fff" : undefined,
                    }}>
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Description</div>
            <textarea value={f.desc || ""} onChange={e => setField("desc", e.target.value)} rows={6}
              placeholder={"e.g. WU 15min\\n5 × 800m @ 3:50/km\\n90sec rest\\nCD 15min"}
              style={{ ...S.input, width:"100%", fontFamily:"monospace", lineHeight:1.6 }}/>
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Pace</div>
              <input type="text" value={f.pace || ""} onChange={e => setField("pace", e.target.value)} placeholder="e.g. 4:30/km" style={S.input}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Terrain</div>
              <input type="text" value={f.terrain || ""} onChange={e => setField("terrain", e.target.value)} placeholder="e.g. FLAT/ROAD" style={S.input}/>
            </div>
          </div>
          <button disabled={!canSave} onClick={async () => {
            const type = f.type || "EASY";
            const sessionData = {
              day: dayDate ? `${ew.dayLabel} ${parseInt(dayDate.slice(8), 10)}` : ew.dayLabel,
              type,
              tag: tagFor(type),
              desc: (f.desc || "").trim(),
              pace: (f.pace || "").trim(),
              terrain: (f.terrain || "").trim(),
            };
            try {
              await saveWorkout(ew.athleteEmail, ew.weekStart, sessionData, ew.sessionId);
              setEditingWorkout(null);
              setCoachScreen("athlete");
            } catch (err) {
              alert("Save failed: " + (err.message || err));
            }
          }} style={{ ...S.primaryBtn(C.crimson, !canSave), width:"100%", marginBottom:8 }}>
            {isNew ? "Add Workout" : "Save Changes"}
          </button>
          <button disabled={!canSave} onClick={async () => {
            const name = prompt("Template name?", (f.desc || "").split("\n")[0].slice(0, 60) || (f.type || "Workout"));
            if (!name) return;
            const type = f.type || "EASY";
            const { data, error } = await supabase.from("workout_templates").insert({
              coach_email: user.email?.toLowerCase(),
              name,
              type,
              tag: tagFor(type),
              description: (f.desc || "").trim(),
              pace: (f.pace || "").trim(),
              terrain: (f.terrain || "").trim(),
            }).select().single();
            if (error) { alert("Save template failed: " + error.message); return; }
            if (data) setWorkoutTemplates(prev => [data, ...prev]);
            alert("Template saved.");
          }} style={{ ...S.ghostBtn, marginBottom:8 }}>Save as template</button>
          {!isNew && (
            <button onClick={async () => {
              if (!confirm("Delete this workout from the plan?")) return;
              try {
                await deleteWorkout(ew.athleteEmail, ew.weekStart, ew.sessionId);
                setEditingWorkout(null);
                setCoachScreen("athlete");
              } catch (err) {
                alert("Delete failed: " + (err.message || err));
              }
            }} style={{ ...S.ghostBtn, marginBottom:8, color:C.crimson, borderColor:C.crimson }}>Delete workout</button>
          )}
          <button onClick={()=>{ setEditingWorkout(null); setCoachScreen("athlete"); }} style={S.ghostBtn}>← Back to week</button>
        </div>
      </div>
    );
  }

  if (role === "athlete" && screen === "profile") {
    return renderProfileScreen({
      title: "My Profile",
      subtitle: "Edit your details",
      email: user.email,
      onBack: () => setScreen("today"),
      headerRight: <button onClick={signOut} style={S.signOutBtn}>Sign out</button>,
    });
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — TODAY (default)
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "today") {
    const myActs = activitiesByEmail.get(user.email?.toLowerCase()) || [];
    const today = todayStr();
    const t = new Date(); t.setHours(0,0,0,0);
    const dow = t.getDay();
    const dayLabel = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow];
    const monOff = dow === 0 ? -6 : 1 - dow;
    const monDate = new Date(t); monDate.setDate(t.getDate() + monOff);
    const monStr = `${monDate.getFullYear()}-${String(monDate.getMonth()+1).padStart(2,"0")}-${String(monDate.getDate()).padStart(2,"0")}`;
    const thisWeek = (programEntry?.weeks || []).find(w => w.weekStart === monStr);
    const allWithMoves = (thisWeek?.sessions || []).map(s => {
      const log = logs[s.id];
      const overrideDate = log?.analysis?.actual_date;
      const onDate = overrideDate || sessionDateStr(monStr, s.day);
      return { s, log, onDate };
    });
    const todaysSession = allWithMoves.find(x => x.onDate === today && (x.s.type || "").toUpperCase() !== "REST");
    const todaysActivity = myActs.find(a => a.activity_date === today);
    const todaysStrava = stravaActivities.find(a => a.start_date_local?.split("T")[0] === today);
    const todaysStravaUnimported = todaysStrava && !myActs.some(a => a.strava_data?.id === todaysStrava.id);
    const dateNice = t.toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });

    const weekStrip = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => {
      const dDate = sessionDateStr(monStr, d);
      // sessionHere = a planned session whose effective day (after any move) lands here.
      const sessionHere = allWithMoves.find(x => x.onDate === dDate);
      // sessionPlanned = the session whose ORIGINAL scheduled day was here (regardless of move).
      const sessionPlanned = (thisWeek?.sessions || []).find(s => sessionDateStr(monStr, s.day) === dDate);
      const actHere = myActs.find(a => a.activity_date === dDate);
      const isLogged = !!actHere || !!sessionHere?.log?.analysis?.distance_km;
      const isToday = dDate === today;
      const isRest = (sessionPlanned?.type || "").toUpperCase() === "REST";
      let dotColor = C.lightRule;
      if (isLogged) dotColor = "#2a6e27"; // green
      else if (sessionPlanned && dDate < today && !isRest) dotColor = "#8b1c1c"; // missed
      else if (sessionPlanned && !isRest) dotColor = typeStyle(sessionPlanned.type).accent;
      const isPattern = sessionPlanned && !isLogged && !isRest && typeStyle(sessionPlanned.type).pattern;
      return { d, dDate, isToday, isLogged, dotColor, hasPlan: !!sessionPlanned, pattern: isPattern ? typeStyle(sessionPlanned.type).pattern : null };
    });

    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title={athleteData.name}
          subtitle={dateNice}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 0 80px" }}>
          {isDesktop && (
            <div style={{ display:"flex", gap:0, alignItems:"flex-start" }}>
              {/* ── DESKTOP LEFT: today hero + strava ── */}
              <div style={{ flex:"0 0 360px", borderRight:`1px solid ${C.rule}`, paddingRight:0 }}>

                {/* Today's planned hero */}
                <div style={{ margin:"20px 16px" }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.crimson, textTransform:"uppercase", marginBottom:8, fontFamily:S.bodyFont, fontWeight:700 }}>
                    TODAY · {dayLabel.toUpperCase()}
                  </div>
                  {todaysSession ? (
                    <div onClick={() => {
                        const s = todaysSession.s;
                        setActiveSession({ ...s, weekStart: monStr });
                        setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
                        setSessionDateOverride(todaysSession.log?.analysis?.actual_date || todaysActivity?.activity_date || today);
                        const isLogged = !!todaysSession.log || !!todaysActivity;
                        setScreen(isLogged ? "result" : "session");
                      }}
                      style={{ background:C.white, border:`1px solid ${C.rule}`, borderLeft:`4px solid ${typeStyle(todaysSession.s.type).accent}`, borderRadius:2, padding:"18px 20px", cursor:"pointer", position:"relative" }}>
                      {typeStyle(todaysSession.s.type).pattern && (
                        <div style={{ position:"absolute", top:0, right:0, width:42, height:42, background:typeStyle(todaysSession.s.type).pattern, borderTopRightRadius:2 }}/>
                      )}
                      <div style={{ fontSize:11, letterSpacing:2, color:typeStyle(todaysSession.s.type).accent, marginBottom:6, fontWeight:700 }}>
                        {(todaysSession.s.type || "RUN").toUpperCase()}
                      </div>
                      <div style={{ fontSize:22, fontWeight:900, color:C.navy, fontFamily:S.displayFont, lineHeight:1.15, marginBottom:6 }}>
                        {todaysSession.s.type}
                      </div>
                      {todaysSession.s.pace && <div style={{ fontSize:13, color:C.mid, fontFamily:"monospace" }}>{todaysSession.s.pace}</div>}
                      {(todaysSession.s.desc || todaysSession.s.description) && (
                        <div style={{ fontSize:13, color:C.mid, marginTop:8, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
                          {todaysSession.s.desc || todaysSession.s.description}
                        </div>
                      )}
                      {todaysSession.s.terrain && <div style={{ fontSize:11, color:C.mid, marginTop:6, letterSpacing:1 }}>{todaysSession.s.terrain}</div>}
                      {(todaysSession.log || todaysActivity) && (
                        <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.rule}`, fontSize:11, color:C.green, letterSpacing:1, fontWeight:700 }}>
                          ✓ LOGGED · {todaysActivity?.distance_km ?? todaysSession.log?.analysis?.distance_km}KM
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"24px", textAlign:"center" }}>
                      <div style={{ fontSize:18, fontWeight:900, color:C.navy, fontFamily:S.displayFont, marginBottom:4 }}>Rest day</div>
                      <div style={{ fontSize:12, color:C.mid }}>No workout scheduled.</div>
                    </div>
                  )}
                </div>

                {/* Strava slot */}
                {todaysStravaUnimported && (
                  <div style={{ margin:"0 16px 16px", background:"#fff5e6", border:`1px solid #ffd699`, borderLeft:`3px solid #fc4c02`, borderRadius:2, padding:"12px 16px" }}>
                    <div style={{ fontSize:10, letterSpacing:2, color:"#fc4c02", fontWeight:700, marginBottom:4 }}>FROM STRAVA · UNIMPORTED</div>
                    <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:2 }}>{todaysStrava.name}</div>
                    <div style={{ fontSize:12, color:C.mid }}>{(todaysStrava.distance/1000).toFixed(1)}km · {Math.round(todaysStrava.moving_time/60)}min</div>
                    <button
                      onClick={() => {
                        if (todaysSession) {
                          const s = todaysSession.s;
                          setActiveSession({ ...s, weekStart: monStr });
                          setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
                          setSessionDateOverride(today);
                          setSelectedStravaId(todaysStrava.id);
                          setScreen("session");
                        } else {
                          setLogForm({ date: today, distanceKm: (todaysStrava.distance/1000).toFixed(2), durationMin: (todaysStrava.moving_time/60).toFixed(1), type: "Run", notes: "" });
                          setEditingActivityId(null);
                          setSelectedStravaId(todaysStrava.id);
                          setScreen("log-activity");
                        }
                      }}
                      style={{ marginTop:8, background:"#fc4c02", color:C.white, border:0, borderRadius:2, padding:"6px 14px", fontSize:11, letterSpacing:1, fontWeight:700, cursor:"pointer" }}>
                      IMPORT &amp; LOG →
                    </button>
                  </div>
                )}

                {/* Quick links (desktop: vertical nav) */}
                <div style={{ margin:"16px 16px 0", display:"flex", flexDirection:"column", gap:8 }}>
                  <button onClick={() => setScreen("home")} style={{ background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 16px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer", textAlign:"left" }}>FULL WEEK VIEW →</button>
                  <button onClick={() => setScreen("history")} style={{ background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 16px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer", textAlign:"left" }}>HISTORY →</button>
                  <button onClick={() => setScreen("profile")} style={{ background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 16px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer", textAlign:"left" }}>PROFILE →</button>
                </div>
              </div>

              {/* ── DESKTOP RIGHT: week overview ── */}
              <div style={{ flex:1, padding:"20px 20px 0" }}>
                <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:14, fontWeight:700 }}>THIS WEEK</div>
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {weekStrip.map(d => {
                    const sessHere = allWithMoves.find(x => x.onDate === d.dDate);
                    const actHere = myActs.find(a => a.activity_date === d.dDate);
                    const s = sessHere?.s;
                    const ts = s ? typeStyle(s.type) : null;
                    const isRest = (s?.type || "").toUpperCase() === "REST";
                    const isLogged = d.isLogged;
                    const datePart = d.dDate ? d.dDate.slice(5).replace("-","/") : "";
                    return (
                      <div key={d.d}
                        onClick={() => {
                          if (sessHere && !isRest) {
                            setActiveSession({...sessHere.s, weekStart:monStr});
                            setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
                            setSessionDateOverride(sessHere.log?.analysis?.actual_date || actHere?.activity_date || d.dDate);
                            setScreen(isLogged ? "result" : "session");
                          }
                        }}
                        style={{
                          background: isLogged && ts ? ts.bg : C.white,
                          border: `1px solid ${isLogged && ts ? ts.border : C.rule}`,
                          borderLeft: `3px solid ${d.dotColor}`,
                          borderRadius: 2,
                          padding: "10px 12px",
                          cursor: sessHere && !isRest ? "pointer" : "default",
                          opacity: isRest ? 0.5 : 1,
                        }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontSize:10, letterSpacing:1.5, color:d.isToday?C.crimson:C.mid, fontWeight:d.isToday?700:400 }}>
                            {d.d.toUpperCase()} · {datePart}{d.isToday ? " · TODAY" : ""}
                          </div>
                          {isLogged && <div style={{ fontSize:10, color:C.green, fontWeight:700 }}>✓</div>}
                          {!isLogged && s && d.dDate < today && !isRest && <div style={{ fontSize:9, color:C.crimson, fontWeight:700, letterSpacing:1 }}>MISSED</div>}
                        </div>
                        {s && !isRest ? (
                          <div style={{ marginTop:4 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>{s.type}</div>
                            {s.pace && <div style={{ fontSize:11, color:ts.accent, fontFamily:"monospace" }}>{s.pace}</div>}
                            {(actHere?.distance_km || sessHere?.log?.analysis?.distance_km) && (
                              <div style={{ fontSize:11, color:C.mid }}>{actHere?.distance_km || sessHere?.log?.analysis?.distance_km}km</div>
                            )}
                          </div>
                        ) : !s && actHere ? (
                          <div style={{ marginTop:4 }}>
                            <div style={{ fontWeight:700, fontSize:13, color:C.navy }}>{actHere.activity_type || "Run"}</div>
                            <div style={{ fontSize:11, color:C.mid }}>{actHere.distance_km}km</div>
                          </div>
                        ) : (
                          <div style={{ fontSize:11, color:C.mid, marginTop:4, fontStyle:"italic" }}>Rest</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {!isDesktop && <>

          {/* Today's planned hero */}
          <div style={{ margin:"20px 16px" }}>
            <div style={{ fontSize:10, letterSpacing:3, color:C.crimson, textTransform:"uppercase", marginBottom:8, fontFamily:S.bodyFont, fontWeight:700 }}>
              TODAY · {dayLabel.toUpperCase()}
            </div>
            {todaysSession ? (
              <div onClick={() => {
                  const s = todaysSession.s;
                  setActiveSession({ ...s, weekStart: monStr });
                  setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
                  setSessionDateOverride(todaysSession.log?.analysis?.actual_date || todaysActivity?.activity_date || today);
                  const isLogged = !!todaysSession.log || !!todaysActivity;
                  setScreen(isLogged ? "result" : "session");
                }}
                style={{ background:C.white, border:`1px solid ${C.rule}`, borderLeft:`4px solid ${typeStyle(todaysSession.s.type).accent}`, borderRadius:2, padding:"18px 20px", cursor:"pointer", position:"relative" }}>
                {typeStyle(todaysSession.s.type).pattern && (
                  <div style={{ position:"absolute", top:0, right:0, width:42, height:42, background:typeStyle(todaysSession.s.type).pattern, borderTopRightRadius:2 }}/>
                )}
                <div style={{ fontSize:11, letterSpacing:2, color:typeStyle(todaysSession.s.type).accent, marginBottom:6, fontWeight:700 }}>
                  {(todaysSession.s.type || "RUN").toUpperCase()}
                </div>
                <div style={{ fontSize:22, fontWeight:900, color:C.navy, fontFamily:S.displayFont, lineHeight:1.15, marginBottom:6 }}>
                  {todaysSession.s.type}
                </div>
                {todaysSession.s.pace && <div style={{ fontSize:13, color:C.mid, fontFamily:"monospace" }}>{todaysSession.s.pace}</div>}
                {(todaysSession.s.desc || todaysSession.s.description) && (
                  <div style={{ fontSize:13, color:C.mid, marginTop:8, lineHeight:1.5, whiteSpace:"pre-wrap" }}>
                    {todaysSession.s.desc || todaysSession.s.description}
                  </div>
                )}
                {todaysSession.s.terrain && <div style={{ fontSize:11, color:C.mid, marginTop:6, letterSpacing:1 }}>{todaysSession.s.terrain}</div>}
                {(todaysSession.log || todaysActivity) && (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${C.rule}`, fontSize:11, color:C.green, letterSpacing:1, fontWeight:700 }}>
                    ✓ LOGGED · {todaysActivity?.distance_km ?? todaysSession.log?.analysis?.distance_km}KM
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background:C.white, border:`1px dashed ${C.rule}`, borderRadius:2, padding:"24px", textAlign:"center" }}>
                <div style={{ fontSize:18, fontWeight:900, color:C.navy, fontFamily:S.displayFont, marginBottom:4 }}>Rest day</div>
                <div style={{ fontSize:12, color:C.mid }}>No workout scheduled.</div>
              </div>
            )}
          </div>

          {/* Strava slot */}
          {todaysStravaUnimported && (
            <div style={{ margin:"0 16px 16px", background:"#fff5e6", border:`1px solid #ffd699`, borderLeft:`3px solid #fc4c02`, borderRadius:2, padding:"12px 16px" }}>
              <div style={{ fontSize:10, letterSpacing:2, color:"#fc4c02", fontWeight:700, marginBottom:4 }}>FROM STRAVA · UNIMPORTED</div>
              <div style={{ fontSize:14, fontWeight:700, color:C.navy, marginBottom:2 }}>{todaysStrava.name}</div>
              <div style={{ fontSize:12, color:C.mid }}>{(todaysStrava.distance/1000).toFixed(1)}km · {Math.round(todaysStrava.moving_time/60)}min</div>
              <button
                onClick={() => {
                  if (todaysSession) {
                    const s = todaysSession.s;
                    setActiveSession({ ...s, weekStart: monStr });
                    setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setSessionRpe(null); setSessionSleepHrs(""); setSessionSoreness(null); setSessionMood(null);
                    setSessionDateOverride(today);
                    setSelectedStravaId(todaysStrava.id);
                    setScreen("session");
                  } else {
                    setLogForm({ date: today, distanceKm: (todaysStrava.distance/1000).toFixed(2), durationMin: (todaysStrava.moving_time/60).toFixed(1), type: "Run", notes: "" });
                    setEditingActivityId(null);
                    setSelectedStravaId(todaysStrava.id);
                    setScreen("log-activity");
                  }
                }}
                style={{ marginTop:8, background:"#fc4c02", color:C.white, border:0, borderRadius:2, padding:"6px 14px", fontSize:11, letterSpacing:1, fontWeight:700, cursor:"pointer" }}>
                IMPORT &amp; LOG →
              </button>
            </div>
          )}

          {/* Week strip */}
          <div style={{ margin:"0 16px 16px", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:C.mid, fontWeight:700 }}>THIS WEEK</div>
              <button onClick={() => setScreen("home")} style={{ background:"transparent", border:0, color:C.crimson, fontSize:11, letterSpacing:1, fontWeight:700, cursor:"pointer", padding:0 }}>OPEN WEEK ›</button>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {weekStrip.map(d => (
                <div key={d.d} onClick={() => setScreen("home")} style={{ flex:1, textAlign:"center", cursor:"pointer" }}>
                  <div style={{ fontSize:9, color: d.isToday ? C.crimson : C.mid, fontWeight: d.isToday ? 700 : 500, letterSpacing:1, marginBottom:6 }}>{d.d.slice(0,1)}</div>
                  <div style={{ width:10, height:10, borderRadius:"50%", background: d.pattern || d.dotColor, margin:"0 auto", border: d.isToday ? `2px solid ${C.navy}` : "none", boxSizing:"content-box" }}/>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div style={{ margin:"0 16px", display:"flex", gap:8 }}>
            <button onClick={() => setScreen("home")} style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer" }}>WEEK</button>
            <button onClick={() => setScreen("history")} style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer" }}>HISTORY</button>
            <button onClick={() => setScreen("profile")} style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px", fontSize:11, letterSpacing:2, color:C.navy, fontWeight:700, cursor:"pointer" }}>PROFILE</button>
          </div>

          </>}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — HOME (Week view)
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "home") {
    const myActs = activitiesByEmail.get(user.email?.toLowerCase()) || [];
    const storedStravaIds = new Set();
    const actByDate = {};
    for (const a of myActs) {
      if (a.strava_data?.id) storedStravaIds.add(a.strava_data.id);
      if (a.source === "session" && !actByDate[a.activity_date]) actByDate[a.activity_date] = a;
    }
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title="This Week"
          subtitle={athleteData.name}
          onBack={() => setScreen("today")}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 0 80px" }}>

          <div onClick={() => setScreen("profile")}
            style={{ margin:"20px 16px", background:C.white, border:`1px solid ${C.rule}`, borderLeft:`3px solid ${C.crimson}`, borderRadius:2, padding:"14px 18px", cursor:"pointer" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:10, letterSpacing:3, color:C.crimson, textTransform:"uppercase", marginBottom:4, fontFamily:S.bodyFont }}>Season Goal</div>
              <div style={{ fontSize:11, color:C.mid }}>Edit ›</div>
            </div>
            <div style={{ fontSize:18, fontWeight:900, color:C.navy, fontFamily:S.displayFont }}>{fmtPbGoal(profile?.goals) || athleteData.goal || "Set your goal"}</div>
            <div style={{ fontSize:12, color:C.mid, marginTop:3 }}>Current PB: {fmtPbGoal(profile?.pbs) || athleteData.current || "—"}</div>
          </div>

          {/* 8-Week Rolling Volume — line graph, Strava-first */}
          {(() => {
            // Strava is the source of truth when connected. We still merge
            // activities table entries so manually-logged runs show up too.
            const W = 8;
            const points = Array.from({ length: W }, (_, i) => {
              const ago = W - 1 - i; // i=0 -> 7 weeks ago, i=W-1 -> this week
              let km = 0;
              if (stravaConnected && stravaActivities.length) {
                km = stravaWeekKm(stravaActivities, new Set(), ago);
                // Add manual non-strava activities too
                const localKm = (myActs.filter(a => !a.strava_data?.id)).reduce((s, a) => {
                  const { monday, sunday } = (() => {
                    const d = new Date(); d.setHours(0,0,0,0);
                    const dow = d.getDay(); const off = dow === 0 ? -6 : 1 - dow;
                    const mon = new Date(d); mon.setDate(d.getDate() + off - ago * 7);
                    const sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23,59,59);
                    return { monday: mon, sunday: sun };
                  })();
                  const ad = new Date(a.activity_date);
                  return ad >= monday && ad <= sunday ? s + parseFloat(a.distance_km || 0) : s;
                }, 0);
                km += localKm;
              } else {
                km = weekKm(myActs, null, ago);
              }
              return { ago, km, label: ago === 0 ? "NOW" : `W-${ago}` };
            });
            const maxKm = Math.max(...points.map(p => p.km), 1);
            const thisWk = points[W - 1].km;
            const hovered = hoveredWeekIdx !== null && hoveredWeekIdx >= 0 && hoveredWeekIdx < W ? points[hoveredWeekIdx] : null;

            // SVG geometry
            const PAD_L = 8, PAD_R = 8, PAD_T = 14, PAD_B = 22;
            const VB_W = 320, VB_H = 110;
            const xFor = i => PAD_L + (i * (VB_W - PAD_L - PAD_R)) / (W - 1);
            const yFor = km => PAD_T + (1 - km / maxKm) * (VB_H - PAD_T - PAD_B);
            const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i).toFixed(1)} ${yFor(p.km).toFixed(1)}`).join(" ");
            const areaPath = `${linePath} L ${xFor(W - 1).toFixed(1)} ${VB_H - PAD_B} L ${xFor(0).toFixed(1)} ${VB_H - PAD_B} Z`;

            return (
              <div style={{ margin:"0 16px 16px", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 18px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:4, fontFamily:S.bodyFont }}>{hovered ? hovered.label : "This Week"}</div>
                    <div style={{ fontSize:26, fontWeight:900, color:C.navy, fontFamily:S.displayFont }}>
                      {(hovered ? hovered.km : thisWk).toFixed(1)}
                      <span style={{ fontSize:14, color:C.mid, fontWeight:400 }}> km</span>
                    </div>
                  </div>
                  <div style={{ fontSize:9, letterSpacing:2, color:C.mid, textTransform:"uppercase" }}>
                    {stravaConnected ? "via Strava" : "manual"}
                  </div>
                </div>
                <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width:"100%", height:"auto", display:"block" }} onMouseLeave={() => setHoveredWeekIdx(null)}>
                  {/* Faint baseline */}
                  <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke={C.rule} strokeWidth="0.6"/>
                  {/* Filled area under line */}
                  <path d={areaPath} fill={C.crimson} fillOpacity="0.08"/>
                  {/* The line */}
                  <path d={linePath} fill="none" stroke={C.crimson} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
                  {/* Markers */}
                  {points.map((p, i) => {
                    const isCurrent = p.ago === 0;
                    const isHovered = hoveredWeekIdx === i;
                    const r = isCurrent || isHovered ? 4 : 3;
                    return (
                      <g key={i}>
                        <circle
                          cx={xFor(i)} cy={yFor(p.km)} r={r}
                          fill={isCurrent ? C.crimson : C.white}
                          stroke={C.crimson} strokeWidth="1.2"
                        />
                        {/* invisible larger hit target */}
                        <rect
                          x={xFor(i) - 14} y={0} width={28} height={VB_H}
                          fill="transparent"
                          onMouseEnter={() => setHoveredWeekIdx(i)}
                          onClick={() => setHoveredWeekIdx(prev => prev === i ? null : i)}
                          style={{ cursor:"pointer" }}
                        />
                        {isHovered && p.km > 0 && (
                          <text x={xFor(i)} y={yFor(p.km) - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={C.navy}>
                            {p.km.toFixed(1)}
                          </text>
                        )}
                        <text x={xFor(i)} y={VB_H - 6} textAnchor="middle" fontSize="8" letterSpacing="0.5" fill={isCurrent ? C.navy : C.mid}>
                          {p.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {!stravaConnected && (myActs.length === 0) && (
                  <div style={{ marginTop:10, fontSize:11, color:C.mid, textAlign:"center" }}>Connect Strava or log a run to start tracking km</div>
                )}
              </div>
            );
          })()}


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

            const snapAthleteMonday = (dateStr) => {
              const mon = snapToMonday(dateStr);
              if (mon) setActiveMonday(mon);
            };

            return (
              <div style={{ padding:"0 16px" }}>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, letterSpacing:3, color:C.mid, textTransform:"uppercase", marginBottom:6, fontFamily:S.bodyFont }}>Week of</div>
                  <input
                    type="date"
                    value={activeMonday}
                    onChange={(e) => snapAthleteMonday(e.target.value)}
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
                            const isLogged = !!log || !!linkedAct;
                            const isMissed = !isLogged && sDate && sDate < todayStr() && (s.type || "").toUpperCase() !== "REST";
                            return (
                              <DraggableSession
                                key={s.id}
                                session={s}
                                log={log}
                                linkedAct={linkedAct}
                                isMissed={isMissed}
                                onClick={() => {
                                  setActiveSession({ ...s, weekStart: w.weekStart });
                                  setFeedbackText("");
                                  setSessionDistKm("");
                                  setSessionDurMin("");
                                  setSessionDateOverride(log?.analysis?.actual_date || linkedAct?.activity_date || todayStr());
                                  setScreen(isLogged ? "result" : "session");
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
          style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"20px 16px 80px" }}
        >
          {stravaConnected && (
            <StravaActivityPicker
              compact={true}
              activities={stravaActivities}
              loading={stravaActivitiesLoading}
              selectedId={selectedStravaId}
              detail={stravaDetail}
              detailLoading={stravaDetailLoading}
              onOpen={() => { loadStravaActivities(); }}
              onSelect={async (id) => {
                setSelectedStravaId(id);
                if (id) {
                  const d = await loadStravaDetail(id);
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
        style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 16px 80px" }}
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
            onOpen={() => { loadStravaActivities(); }}
            onSelect={async (id) => {
              setSelectedStravaId(id);
              if (id) {
                const d = await loadStravaDetail(id);
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
        <SectionCard label="Wellness">
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>RPE — Effort 1–10</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} type="button" onClick={() => setSessionRpe(sessionRpe === n ? null : n)}
                  style={{
                    flex:"1 0 38px", minWidth:38, padding:"8px 0",
                    background: sessionRpe===n ? C.crimson : C.white,
                    color:      sessionRpe===n ? "#fffdf8" : C.navy,
                    border:`1px solid ${sessionRpe===n ? C.crimson : C.rule}`,
                    borderRadius:2, fontSize:12, fontWeight:700, cursor:"pointer",
                  }}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Sleep last night (hours)</div>
            <input type="number" step="0.5" min="0" max="14" placeholder="e.g. 7.5"
              value={sessionSleepHrs} onChange={e=>setSessionSleepHrs(e.target.value)}
              style={{ ...S.input, width:120 }}/>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Soreness — 1 none · 5 severe</div>
            <div style={{ display:"flex", gap:4 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setSessionSoreness(sessionSoreness === n ? null : n)}
                  style={{
                    flex:1, padding:"8px 0",
                    background: sessionSoreness===n ? C.crimson : C.white,
                    color:      sessionSoreness===n ? "#fffdf8" : C.navy,
                    border:`1px solid ${sessionSoreness===n ? C.crimson : C.rule}`,
                    borderRadius:2, fontSize:12, fontWeight:700, cursor:"pointer",
                  }}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>Mood — 1 bad · 5 great</div>
            <div style={{ display:"flex", gap:4 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" onClick={() => setSessionMood(sessionMood === n ? null : n)}
                  style={{
                    flex:1, padding:"8px 0",
                    background: sessionMood===n ? C.crimson : C.white,
                    color:      sessionMood===n ? "#fffdf8" : C.navy,
                    border:`1px solid ${sessionMood===n ? C.crimson : C.rule}`,
                    borderRadius:2, fontSize:12, fontWeight:700, cursor:"pointer",
                  }}>{["😞","😕","😐","🙂","😄"][n-1]} {n}</button>
              ))}
            </div>
          </div>
        </SectionCard>

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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 16px 80px" }}>
          <div style={{ textAlign:"center", fontSize:64, margin:"20px 0 8px" }}>{an?.emoji || "✓"}</div>
          <div style={{ textAlign:"center", fontSize:14, color:C.green, fontWeight:700, marginBottom:20, letterSpacing:1 }}>SESSION LOGGED</div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {an?.distance_km && <StatPill label="Distance" val={`${an.distance_km}km`} color="#4ade80"/>}
            {an?.duration_min && <StatPill label="Duration" val={`${an.duration_min}min`}/>}
          </div>
          {log?.strava_data && <StravaCard data={log.strava_data}/>}
          {an?.wellness && Object.keys(an.wellness).length > 0 && (
            <SectionCard label="Wellness">
              <div style={{ display:"flex", gap:14, flexWrap:"wrap", fontSize:13, color:C.navy }}>
                {an.wellness.rpe        != null && <div><b>RPE</b> {an.wellness.rpe}/10</div>}
                {an.wellness.sleep_hours != null && <div><b>Sleep</b> {an.wellness.sleep_hours}h</div>}
                {an.wellness.soreness   != null && <div><b>Soreness</b> {an.wellness.soreness}/5</div>}
                {an.wellness.mood       != null && <div><b>Mood</b> {["😞","😕","😐","🙂","😄"][an.wellness.mood-1]} {an.wellness.mood}/5</div>}
              </div>
            </SectionCard>
          )}
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
            const w = an?.wellness || {};
            setFeedbackText(log?.feedback || "");
            setSessionDistKm(an?.distance_km?.toString() || "");
            setSessionDurMin(an?.duration_min?.toString() || "");
            setSessionDateOverride(an?.actual_date || resultLinkedAct?.activity_date || sessionDateStr(activeSession.weekStart, activeSession.day));
            setSessionRpe(w.rpe ?? null);
            setSessionSleepHrs(w.sleep_hours != null ? String(w.sleep_hours) : "");
            setSessionSoreness(w.soreness ?? null);
            setSessionMood(w.mood ?? null);
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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"0 16px 80px" }}>
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
        <div style={{ maxWidth: isDesktop ? 760 : 500, margin:"0 auto", padding:"24px 16px 80px" }}>
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
