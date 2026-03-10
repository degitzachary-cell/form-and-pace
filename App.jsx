import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const ATHLETE_PROGRAMS = {
  "suzy0913@gmail.com": {
    name: "Siouxsie Sioux", goal: "1:50 HM", current: "1:55", avatar: "SS",
    weeks: [
      {
        weekLabel: "Week 1 · 9–15 Mar", weekStart: "2026-03-09",
        sessions: [
          { id:"s1", day:"Mon 09", type:"LONG RUN",  tag:"easy",  desc:"16km Easy Run\n(5:45–6:00 /km)\nWith Coach",                            pace:"5:45–6:00 /km",        terrain:"FLAT/ROAD" },
          { id:"s2", day:"Tue 10", type:"SPEED",     tag:"speed", desc:"WU 15min\n8 × 400m @ 4:15–4:20 /km\n90sec rest\nCD 15min",              pace:"4:15–4:20 /km",        terrain:"TRACK" },
          { id:"s3", day:"Thu 12", type:"TEMPO",     tag:"tempo", desc:"WU 15min\n3 × 2km @ 5:15–5:20 /km (HM pace)\n2min jog rec\nCD 15min",   pace:"HM: 5:15–5:20 /km",    terrain:"ROAD" },
          { id:"s4", day:"Fri 13", type:"EASY",      tag:"easy",  desc:"45min Easy\n6 × 15sec strides\n30sec rest",                              pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"s5", day:"Sat 14", type:"LONG RUN",  tag:"easy",  desc:"75min Easy\n(5:45–6:00 /km)",                                            pace:"5:45–6:00 /km",        terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 2 · 16–22 Mar", weekStart: "2026-03-16",
        sessions: [
          { id:"s6",  day:"Mon 16", type:"RECOVERY", tag:"easy",  desc:"55min Recovery\n6 × 15sec strides",                                       pace:"5:45–6:00 /km",        terrain:"FLAT" },
          { id:"s7",  day:"Tue 17", type:"SPEED",    tag:"speed", desc:"WU 15min\n10 × 1min @ 4:20 /km (1% incline)\n60sec rest\nCD 15min",       pace:"4:20 /km",             terrain:"TREADMILL" },
          { id:"s8",  day:"Thu 19", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n5 × 1.6km @ 5:15–5:20 /km (HM pace)\n90sec jog\nCD 15min",     pace:"HM: 5:15–5:20 /km",    terrain:"FLAT/ROAD" },
          { id:"s9",  day:"Fri 20", type:"EASY",     tag:"easy",  desc:"50min Easy\n6 × 15sec strides\n30sec rest",                               pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"s10", day:"Sat 21", type:"LONG RUN", tag:"tempo", desc:"60min Easy (5:50 /km)\n→ 30min @ 5:20–5:25 /km (near HM pace)",           pace:"Easy 5:50 / HM 5:20–5:25", terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 3 · 23–29 Mar", weekStart: "2026-03-23",
        sessions: [
          { id:"s11", day:"Mon 23", type:"RECOVERY", tag:"easy",  desc:"60min Recovery\n6 × 15sec strides",                                                   pace:"5:45–6:00 /km",        terrain:"FLAT" },
          { id:"s12", day:"Tue 24", type:"SPEED",    tag:"speed", desc:"WU 15min\n12 × 200m @ 4:00–4:10 /km\n60sec rest\nCD 15min",                           pace:"4:00–4:10 /km",        terrain:"TRACK" },
          { id:"s13", day:"Thu 26", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n25min @ 5:15–5:20 /km\n5min float (5:50)\n10min @ 5:15–5:20 /km\nCD 15min", pace:"HM: 5:15–5:20 /km",    terrain:"FLAT/ROAD" },
          { id:"s14", day:"Fri 27", type:"EASY",     tag:"easy",  desc:"50min Easy\n6 × 15sec strides\n30sec rest",                                            pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"s15", day:"Sat 28", type:"LONG RUN", tag:"tempo", desc:"70min Easy (5:45 /km)\n→ 40min @ 5:15–5:25 /km (HM pace)",                             pace:"Easy 5:45 / HM 5:15–5:25", terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 4 · Deload · 30 Mar–5 Apr", weekStart: "2026-03-30",
        sessions: [
          { id:"s16", day:"Mon 30", type:"RECOVERY", tag:"easy",  desc:"40min Recovery\n6 × 15sec strides",                              pace:"5:50–6:00 /km",   terrain:"FLAT" },
          { id:"s17", day:"Tue 31", type:"SPEED",    tag:"speed", desc:"WU 15min\n6 × 1min @ 4:25 /km\n90sec rest\nCD 15min",            pace:"4:25 /km",        terrain:"TREADMILL/TRACK" },
          { id:"s18", day:"Thu 02", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n3 × 1.6km @ 5:20 /km (HM pace)\n2min jog\nCD 15min",  pace:"HM: 5:20 /km",   terrain:"FLAT" },
          { id:"s19", day:"Fri 03", type:"EASY",     tag:"easy",  desc:"40min Easy\n6 × 15sec strides\n30sec rest",                      pace:"5:50–6:00 /km",   terrain:"FLAT" },
          { id:"s20", day:"Sat 04", type:"LONG RUN", tag:"easy",  desc:"60min Easy\n(5:50–6:00 /km)",                                    pace:"5:50–6:00 /km",   terrain:"FLAT" },
        ]
      },
    ]
  },
  "z.degit@gmail.com": {
    name: "Zachary Degit", goal: "1:50 HM", current: "1:55", avatar: "ZD",
    weeks: [
      {
        weekLabel: "Week 1 · 9–15 Mar", weekStart: "2026-03-09",
        sessions: [
          { id:"zd-s1", day:"Mon 09", type:"LONG RUN",  tag:"easy",  desc:"16km Easy Run\n(5:45–6:00 /km)\nWith Coach",                            pace:"5:45–6:00 /km",        terrain:"FLAT/ROAD" },
          { id:"zd-s2", day:"Tue 10", type:"SPEED",     tag:"speed", desc:"WU 15min\n8 × 400m @ 4:15–4:20 /km\n90sec rest\nCD 15min",              pace:"4:15–4:20 /km",        terrain:"TRACK" },
          { id:"zd-s3", day:"Thu 12", type:"TEMPO",     tag:"tempo", desc:"WU 15min\n3 × 2km @ 5:15–5:20 /km (HM pace)\n2min jog rec\nCD 15min",   pace:"HM: 5:15–5:20 /km",    terrain:"ROAD" },
          { id:"zd-s4", day:"Fri 13", type:"EASY",      tag:"easy",  desc:"45min Easy\n6 × 15sec strides\n30sec rest",                              pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"zd-s5", day:"Sat 14", type:"LONG RUN",  tag:"easy",  desc:"75min Easy\n(5:45–6:00 /km)",                                            pace:"5:45–6:00 /km",        terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 2 · 16–22 Mar", weekStart: "2026-03-16",
        sessions: [
          { id:"zd-s6",  day:"Mon 16", type:"RECOVERY", tag:"easy",  desc:"55min Recovery\n6 × 15sec strides",                                       pace:"5:45–6:00 /km",        terrain:"FLAT" },
          { id:"zd-s7",  day:"Tue 17", type:"SPEED",    tag:"speed", desc:"WU 15min\n10 × 1min @ 4:20 /km (1% incline)\n60sec rest\nCD 15min",       pace:"4:20 /km",             terrain:"TREADMILL" },
          { id:"zd-s8",  day:"Thu 19", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n5 × 1.6km @ 5:15–5:20 /km (HM pace)\n90sec jog\nCD 15min",     pace:"HM: 5:15–5:20 /km",    terrain:"FLAT/ROAD" },
          { id:"zd-s9",  day:"Fri 20", type:"EASY",     tag:"easy",  desc:"50min Easy\n6 × 15sec strides\n30sec rest",                               pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"zd-s10", day:"Sat 21", type:"LONG RUN", tag:"tempo", desc:"60min Easy (5:50 /km)\n→ 30min @ 5:20–5:25 /km (near HM pace)",           pace:"Easy 5:50 / HM 5:20–5:25", terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 3 · 23–29 Mar", weekStart: "2026-03-23",
        sessions: [
          { id:"zd-s11", day:"Mon 23", type:"RECOVERY", tag:"easy",  desc:"60min Recovery\n6 × 15sec strides",                                                   pace:"5:45–6:00 /km",        terrain:"FLAT" },
          { id:"zd-s12", day:"Tue 24", type:"SPEED",    tag:"speed", desc:"WU 15min\n12 × 200m @ 4:00–4:10 /km\n60sec rest\nCD 15min",                           pace:"4:00–4:10 /km",        terrain:"TRACK" },
          { id:"zd-s13", day:"Thu 26", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n25min @ 5:15–5:20 /km\n5min float (5:50)\n10min @ 5:15–5:20 /km\nCD 15min", pace:"HM: 5:15–5:20 /km",    terrain:"FLAT/ROAD" },
          { id:"zd-s14", day:"Fri 27", type:"EASY",     tag:"easy",  desc:"50min Easy\n6 × 15sec strides\n30sec rest",                                            pace:"5:50–6:00 /km",        terrain:"FLAT" },
          { id:"zd-s15", day:"Sat 28", type:"LONG RUN", tag:"tempo", desc:"70min Easy (5:45 /km)\n→ 40min @ 5:15–5:25 /km (HM pace)",                             pace:"Easy 5:45 / HM 5:15–5:25", terrain:"FLAT" },
        ]
      },
      {
        weekLabel: "Week 4 · Deload · 30 Mar–5 Apr", weekStart: "2026-03-30",
        sessions: [
          { id:"zd-s16", day:"Mon 30", type:"RECOVERY", tag:"easy",  desc:"40min Recovery\n6 × 15sec strides",                              pace:"5:50–6:00 /km",   terrain:"FLAT" },
          { id:"zd-s17", day:"Tue 31", type:"SPEED",    tag:"speed", desc:"WU 15min\n6 × 1min @ 4:25 /km\n90sec rest\nCD 15min",            pace:"4:25 /km",        terrain:"TREADMILL/TRACK" },
          { id:"zd-s18", day:"Thu 02", type:"TEMPO",    tag:"tempo", desc:"WU 15min\n3 × 1.6km @ 5:20 /km (HM pace)\n2min jog\nCD 15min",  pace:"HM: 5:20 /km",   terrain:"FLAT" },
          { id:"zd-s19", day:"Fri 03", type:"EASY",     tag:"easy",  desc:"40min Easy\n6 × 15sec strides\n30sec rest",                      pace:"5:50–6:00 /km",   terrain:"FLAT" },
          { id:"zd-s20", day:"Sat 04", type:"LONG RUN", tag:"easy",  desc:"60min Easy\n(5:50–6:00 /km)",                                    pace:"5:50–6:00 /km",   terrain:"FLAT" },
        ]
      },
    ]
  },
  "jeremy@muchogroup.com.au": {
    name: "Jeremy Blackmore", goal: "1:23 HM / 3:00 M", current: "1:24 HM / 3:09 M", avatar: "JB",
    weeks: [
      {
        weekLabel: "Week 1 · 16–22 Mar", weekStart: "2026-03-16",
        sessions: [
          { id:"jb-s1", day:"Mon 16", type:"RECOVERY", tag:"easy",  desc:"4km Easy w/ Son\n+ 20min Easy Extension (~4km)\nTotal ~8km Recovery",                               pace:"5:10–5:20 /km",        terrain:"FLAT/ROAD" },
          { id:"jb-s2", day:"Tue 17", type:"SPEED",    tag:"speed", desc:"WU 15min (~3km)\n5 × 800m @ 3:50–3:55 /km\n90sec standing rest\nCD 15min (~3km)\nTotal ~10km",      pace:"3:50–3:55 /km",        terrain:"TRACK OR ROAD" },
          { id:"jb-s3", day:"Wed 18", type:"EASY",     tag:"easy",  desc:"50min Easy Run\n(4:50–5:10 /km)\n~10km\nStrength: Weights",                                         pace:"4:50–5:10 /km",        terrain:"FLAT/ROAD" },
          { id:"jb-s4", day:"Thu 19", type:"TEMPO",    tag:"tempo", desc:"WU 15min (~3km)\n3 × 10min @ MP (4:10 /km)\n2min jog recovery\nCD 15min (~3km)\nTotal ~16km",       pace:"MP: 4:10 /km",         terrain:"ROAD" },
          { id:"jb-s5", day:"Fri 20", type:"EASY",     tag:"easy",  desc:"45min Easy (~9km)\n6 × 15sec Strides\n30sec rest\nStrength: Mobility",                              pace:"Easy: 4:50–5:10 /km",  terrain:"FLAT" },
          { id:"jb-s6", day:"Sat 21", type:"LONG RUN", tag:"easy",  desc:"75min Easy\n(4:50–5:05 /km)\n~15km",                                                                pace:"4:50–5:05 /km",        terrain:"FLAT/ROAD" },
        ]
      },
      {
        weekLabel: "Week 2 · 23–29 Mar", weekStart: "2026-03-23",
        sessions: [
          { id:"jb-s7",  day:"Mon 23", type:"RECOVERY", tag:"easy",  desc:"4km Easy w/ Son\n+ 25min Easy Extension (~5km)\nTotal ~9km — Recovery",                                  pace:"5:10–5:20 /km",       terrain:"FLAT/ROAD" },
          { id:"jb-s8",  day:"Tue 24", type:"SPEED",    tag:"speed", desc:"WU 15min (~3km)\n25min @ 4:10 /km, 6% incline\n(Aerobic strength ~6km)\nCD 15min (~3km)\nTotal ~12km",   pace:"4:10 /km @ 6% incline", terrain:"TREADMILL" },
          { id:"jb-s9",  day:"Wed 25", type:"EASY",     tag:"easy",  desc:"55min Easy Run\n(4:50–5:10 /km)\n~11km\nStrength: Weights",                                               pace:"4:50–5:10 /km",       terrain:"FLAT/ROAD" },
          { id:"jb-s10", day:"Thu 26", type:"TEMPO",    tag:"tempo", desc:"WU 15min (~3km)\n4 × 8min @ HMP (3:55–4:00 /km)\n90sec jog recovery\nCD 15min (~3km)\nTotal ~15km",      pace:"HMP: 3:55–4:00 /km",  terrain:"FLAT/ROAD" },
          { id:"jb-s11", day:"Fri 27", type:"EASY",     tag:"easy",  desc:"45min Easy (~9km)\n6 × 15sec Strides\n30sec rest\nStrength: Mobility",                                    pace:"Easy: 4:50–5:10 /km", terrain:"FLAT" },
          { id:"jb-s12", day:"Sat 28", type:"LONG RUN", tag:"tempo", desc:"70min Easy (4:50–5:05 /km) ~14km\nFinal 10min @ 4:20 /km",                                               pace:"Easy → 4:20 /km",     terrain:"FLAT/ROAD" },
        ]
      },
      {
        weekLabel: "Week 3 · 30 Mar–5 Apr", weekStart: "2026-03-30",
        sessions: [
          { id:"jb-s13", day:"Mon 30", type:"RECOVERY", tag:"easy",  desc:"4km Easy w/ Son\n+ 25min Easy Extension (~5km)\nTotal ~9km — Recovery",                               pace:"5:10–5:20 /km",      terrain:"FLAT/ROAD" },
          { id:"jb-s14", day:"Tue 31", type:"SPEED",    tag:"speed", desc:"WU 15min (~3km)\n6 × 1km @ 3:50 /km (10k Pace)\n2min standing rest\nCD 15min (~3km)\nTotal ~12km",    pace:"10k: 3:50 /km",      terrain:"TRACK OR ROAD" },
          { id:"jb-s15", day:"Wed 01", type:"EASY",     tag:"easy",  desc:"55min Easy Run\n(4:50–5:05 /km)\n~11km\nStrength: Weights",                                           pace:"4:50–5:05 /km",      terrain:"FLAT/ROAD" },
          { id:"jb-s16", day:"Thu 02", type:"TEMPO",    tag:"tempo", desc:"WU 15min (~3km)\n5km @ HMP (3:55–4:00 /km)\n3min jog\n5km @ HMP\nCD 15min (~3km)\nTotal ~18km",      pace:"HMP: 3:55–4:00 /km", terrain:"FLAT/ROAD" },
          { id:"jb-s17", day:"Fri 03", type:"EASY",     tag:"easy",  desc:"50min Easy (~10km)\n6 × 20sec Strides\n40sec rest\nStrength: Mobility",                               pace:"Easy: 4:50–5:10 /km", terrain:"FLAT" },
          { id:"jb-s18", day:"Sat 04", type:"LONG RUN", tag:"easy",  desc:"85min Easy\n(4:50–5:05 /km)\n~17km",                                                                  pace:"4:50–5:05 /km",      terrain:"FLAT/ROAD" },
        ]
      },
      {
        weekLabel: "Week 4 · Deload · 6–12 Apr", weekStart: "2026-04-06",
        sessions: [
          { id:"jb-s19", day:"Mon 06", type:"RECOVERY", tag:"easy",  desc:"4km Easy w/ Son\n+ 20min Easy Extension (~4km)\nTotal ~8km — Recovery",                                   pace:"5:10–5:20 /km",          terrain:"FLAT/ROAD" },
          { id:"jb-s20", day:"Tue 07", type:"SPEED",    tag:"speed", desc:"WU 15min (~3km)\n8 × 3min @ 4:00 /km, 5–7% incline\n90sec standing rest\nCD 15min (~3km)\nTotal ~10km",  pace:"4:00 /km @ 5–7% incline", terrain:"TREADMILL" },
          { id:"jb-s21", day:"Wed 08", type:"EASY",     tag:"easy",  desc:"45min Easy Run\n(5:00–5:10 /km)\n~9km\nStrength: Weights (lighter)",                                      pace:"5:00–5:10 /km",          terrain:"FLAT/ROAD" },
          { id:"jb-s22", day:"Thu 09", type:"TEMPO",    tag:"tempo", desc:"WU 15min (~3km)\n3 × 2km @ HMP (3:55–4:00 /km)\n2min jog recovery\nCD 15min (~3km)\nTotal ~12km",        pace:"HMP: 3:55–4:00 /km",     terrain:"FLAT/ROAD" },
          { id:"jb-s23", day:"Fri 10", type:"EASY",     tag:"easy",  desc:"40min Easy (~8km)\n4 × 15sec Strides\n30sec rest\nStrength: Mobility",                                    pace:"Easy: 4:55–5:10 /km",    terrain:"FLAT" },
          { id:"jb-s24", day:"Sat 11", type:"LONG RUN", tag:"easy",  desc:"60min Easy\n(4:55–5:10 /km)\n~12km",                                                                      pace:"4:55–5:10 /km",          terrain:"FLAT/ROAD" },
        ]
      },
    ]
  },
  // Add more athletes here by email
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const TAG_STYLE = {
  easy:  { bg:"#0d2818", accent:"#4ade80" },
  speed: { bg:"#2d1500", accent:"#fb923c" },
  tempo: { bg:"#2d0a0a", accent:"#f87171" },
};
const COMPLY_COLOR = { completed:"#4ade80", missed:"#f87171", partial:"#fbbf24", pending:"#555" };
const COMPLY_LABEL = { completed:"✓ Done", missed:"✗ Missed", partial:"~ Partial", pending:"Pending" };

// ─── WEEK HELPERS ─────────────────────────────────────────────────────────────
function getWeekBounds(weeksAgo = 0) {
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

function weekKm(activities, email, weeksAgo = 0) {
  const { monday, sunday } = getWeekBounds(weeksAgo);
  return activities
    .filter(a => {
      if (email && a.athlete_email !== email) return false;
      const d = new Date(a.activity_date);
      return d >= monday && d <= sunday;
    })
    .reduce((sum, a) => sum + parseFloat(a.distance_km || 0), 0);
}

// ─── SESSION DATE HELPER ──────────────────────────────────────────────────────
function sessionDateStr(weekStart, dayAbbrev) {
  const DAY_OFFSET = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };
  const offset = DAY_OFFSET[dayAbbrev.slice(0, 3)] ?? 0;
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + offset);
  // Use local date parts to avoid UTC offset shifting the date
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}


async function callClaude(systemPrompt, userMsg) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/claude-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt, userMsg }),
  });
  const d = await res.json();
  return d.content?.[0]?.text || "{}";
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
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [feedbackText,  setFeedbackText]  = useState("");
  const [sessionDistKm, setSessionDistKm] = useState("");
  const [sessionDurMin, setSessionDurMin] = useState("");
  const [isSaving,     setIsSaving]      = useState(false);

  // Coach state
  const [coachScreen,   setCoachScreen]   = useState("dashboard");
  const [dashAthlete,   setDashAthlete]   = useState(null);
  const [coachReply,    setCoachReply]    = useState("");

  // Profile (loaded from DB on login — determines role)
  const [profile,       setProfile]       = useState(null);

  // Logs stored in Supabase — keyed by session_id
  const [logs,          setLogs]          = useState({});
  const [logsLoading,   setLogsLoading]   = useState(false);

  // Strava state
  const [stravaConnected, setStravaConnected] = useState(false);

  // Activities (manual logging + future Strava sync)
  const [activities,  setActivities]  = useState([]);
  const [logForm,     setLogForm]     = useState({ date: new Date().toISOString().split("T")[0], distanceKm: "", durationMin: "", type: "Run", notes: "" });
  const [logSaving,   setLogSaving]   = useState(false);

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
      const prog = ATHLETE_PROGRAMS[email];
      const newProfile = {
        email,
        role: "athlete",
        name: prog?.name || u.user_metadata?.full_name || email,
        avatar: prog?.avatar || (u.user_metadata?.full_name || email).slice(0,2).toUpperCase(),
        goal: prog?.goal || null,
        current_pb: prog?.current || null,
      };
      const { data: created } = await supabase.from("profiles").insert(newProfile).select().maybeSingle();
      profileData = created || newProfile;
    }
    setProfile(profileData);
    setRole(profileData?.role || "athlete");
    setAuthLoading(false);
  };

  // ── Capture Strava OAuth code before auth resolves ──
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get("code");
    if (code && p.get("scope")?.includes("activity")) {
      window.history.replaceState({}, "", window.location.pathname);
      sessionStorage.setItem("strava_pending_code", code);
    }
  }, []);

  // ── Load logs + Strava state when user is set ──
  useEffect(() => {
    if (!user) return;
    loadLogs();
    loadActivities();
    loadMonthlySummaries();
    const pendingCode = sessionStorage.getItem("strava_pending_code");
    if (pendingCode) {
      sessionStorage.removeItem("strava_pending_code");
      exchangeStravaCode(pendingCode);
    } else {
      checkStravaConnection();
    }
  }, [user]);

  const loadLogs = async () => {
    setLogsLoading(true);
    const { data, error } = await supabase
      .from("session_logs")
      .select("*");
    if (!error && data) {
      const map = {};
      data.forEach(row => { map[row.session_id] = row; });
      setLogs(map);
    }
    setLogsLoading(false);
  };

  const loadActivities = async () => {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .order("activity_date", { ascending: false });
    if (!error && data) setActivities(data);
  };

  const loadMonthlySummaries = async () => {
    const { data, error } = await supabase
      .from("monthly_summaries")
      .select("*");
    if (!error && data) {
      const map = {};
      data.forEach(row => {
        map[row.athlete_email] = { ...row.summary, generatedAt: row.generated_at };
      });
      setMonthlySummaries(map);
    }
  };

  const saveActivity = async (form) => {
    setLogSaving(true);
    const payload = {
      athlete_email: user.email?.toLowerCase(),
      athlete_name: athleteData?.name || user.user_metadata?.full_name || user.email,
      activity_date: form.date,
      distance_km: parseFloat(form.distanceKm),
      duration_seconds: form.durationMin ? Math.round(parseFloat(form.durationMin) * 60) : null,
      activity_type: form.type,
      notes: form.notes || null,
      source: "manual",
    };
    const { data, error } = await supabase.from("activities").insert(payload).select().single();
    if (!error && data) {
      setActivities(prev => [data, ...prev]);
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
          await saveLog(matchedSession.id, { analysis: autoAnalysis });
        }
      }
      setLogForm({ date: new Date().toISOString().split("T")[0], distanceKm: "", durationMin: "", type: "Run", notes: "" });
      setScreen("home");
    }
    setLogSaving(false);
    return !error;
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
    if (!error && data) {
      setLogs(prev => ({ ...prev, [sessionId]: data }));
    }
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
    setUser(null); setRole(null); setProfile(null); setLogs({}); setActivities([]);
    setStravaConnected(false);
  };

  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const stravaCall = async (action, extra = {}) => {
    const token = await getAuthToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
    });
    return res.json();
  };

  const checkStravaConnection = async () => {
    try {
      const d = await stravaCall("check");
      setStravaConnected(d.connected === true);
    } catch { setStravaConnected(false); }
  };

  const exchangeStravaCode = async (code) => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (d.success) setStravaConnected(true);
    } catch (e) { console.error("Strava exchange error", e); }
  };


  // ── Resolve athlete program ──
  const athleteEmail   = user?.email?.toLowerCase();
  const programEntry   = ATHLETE_PROGRAMS[athleteEmail] || null;
  // Profile is the source of truth for identity; program provides weeks
  const athleteData    = programEntry ? {
    name:    profile?.name    || programEntry.name,
    goal:    profile?.goal    || programEntry.goal,
    current: profile?.current_pb || programEntry.current,
    avatar:  profile?.avatar  || programEntry.avatar,
    weeks:   programEntry.weeks,
  } : null;
  const weeks        = athleteData?.weeks || [];
  const allSessions  = weeks.flatMap(w => w.sessions);

  const handleSubmitFeedback = async () => {
    if (!sessionDistKm || !activeSession) return;
    setIsSaving(true);
    const s = activeSession;
    try {
      const TAG_EMOJI = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
      const analysis = {
        compliance: "completed",
        emoji: TAG_EMOJI[s.tag] || "🏃",
        distance_km: parseFloat(sessionDistKm),
        duration_min: sessionDurMin ? parseFloat(sessionDurMin) : null,
      };
      await saveLog(s.id, { feedback: feedbackText, analysis });

      // Save to activities so distance counts toward weekly total
      const sessionDate = s.weekStart
        ? sessionDateStr(s.weekStart, s.day)
        : (() => { const d = new Date(); const y = d.getFullYear(); const mo = String(d.getMonth()+1).padStart(2,"0"); const dy = String(d.getDate()).padStart(2,"0"); return `${y}-${mo}-${dy}`; })();
      const existing = activities.find(a => a.athlete_email === user.email?.toLowerCase() && a.activity_date === sessionDate);
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
        };
        const { data: actData } = await supabase.from("activities").insert(payload).select().single();
        if (actData) setActivities(prev => [actData, ...prev]);
      }

      setSessionDistKm("");
      setSessionDurMin("");
      setScreen("result");
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  // ── Monthly block summary ──
  const [monthlySummaries, setMonthlySummaries] = useState({});
  const [summaryLoading,   setSummaryLoading]   = useState(false);

  const generateMonthlySummary = async (email) => {
    const da = ATHLETE_PROGRAMS[email];
    if (!da) return;
    setSummaryLoading(true);

    const allSessions = da.weeks.flatMap(w => w.sessions);
    const sessionData = allSessions.map(s => {
      const log = logs[s.id];
      const weekNum = da.weeks.findIndex(w => w.sessions.some(ws => ws.id === s.id)) + 1;
      return {
        weekNum,
        day: s.day,
        type: s.type,
        compliance: log?.analysis?.compliance || "pending",
        rpe: log?.analysis?.rpe || null,
        paceStatus: log?.analysis?.paceStatus || null,
        keyInsight: log?.analysis?.keyInsight || null,
      };
    });

    const weeklyKm = [3,2,1,0].map((ago, i) => ({
      label: `Week ${i + 1}`,
      km: weekKm(activities, email, ago).toFixed(1),
    }));

    const logged    = sessionData.filter(s => s.compliance !== "pending").length;
    const completed = sessionData.filter(s => s.compliance === "completed").length;
    const missed    = sessionData.filter(s => s.compliance === "missed").length;
    const partial   = sessionData.filter(s => s.compliance === "partial").length;

    const systemPrompt = `You are an expert running coach writing a concise 4-week block review for an athlete. Be specific, encouraging but honest. Respond ONLY with valid JSON, no markdown, no backticks.`;

    const userMsg = `Athlete: ${da.name}
Goal: ${da.goal} | Current PB: ${da.current}

4-WEEK BLOCK — SESSION COMPLIANCE
Total: ${logged}/${allSessions.length} logged | Completed: ${completed} | Missed: ${missed} | Partial: ${partial}

Session Breakdown:
${sessionData.map(s =>
  `  Wk${s.weekNum} ${s.day} ${s.type}: ${s.compliance}` +
  (s.paceStatus ? ` | pace ${s.paceStatus}` : "") +
  (s.rpe        ? ` | RPE ${s.rpe}` : "") +
  (s.keyInsight ? ` | "${s.keyInsight}"` : "")
).join("\n")}

Weekly Volume:
${weeklyKm.map(w => `  ${w.label}: ${w.km}km`).join("\n")}

Return JSON with exactly these keys:
{
  "headline": "one punchy sentence summarising the block (max 12 words)",
  "wins": ["win 1", "win 2"],
  "watchPoints": ["concern 1"],
  "nextBlockFocus": "one clear coaching priority for the next 4 weeks",
  "volumeTrend": "brief 1-sentence description of km progression"
}`;

    try {
      const raw = await callClaude(systemPrompt, userMsg);
      const parsed = JSON.parse(raw);
      const generatedAt = new Date().toISOString();
      const blockStart = da.weeks[0]?.weekStart || "";
      await supabase.from("monthly_summaries").upsert(
        { athlete_email: email, block_start: blockStart, summary: parsed, generated_at: generatedAt },
        { onConflict: "athlete_email,block_start" }
      );
      setMonthlySummaries(prev => ({
        ...prev,
        [email]: { ...parsed, generatedAt },
      }));
    } catch (e) {
      console.error("Summary parse error", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  // ── Coach reply ──
  const handleCoachReply = async (sessionId) => {
    if (!coachReply.trim()) return;
    await saveLog(sessionId, { ...logs[sessionId], coach_reply: coachReply });
    setCoachReply("");
  };

  // ── Compliance stats ──
  const getStats = (email) => {
    const program = ATHLETE_PROGRAMS[email];
    const sessions = (program?.weeks || []).flatMap(w =>
      w.sessions.map(s => ({ ...s, sessionDate: sessionDateStr(w.weekStart, s.day) }))
    );
    const total = sessions.length;
    const athActDates = new Set(
      activities.filter(a => a.athlete_email === email?.toLowerCase()).map(a => a.activity_date)
    );
    const done   = sessions.filter(s =>
      logs[s.id]?.analysis?.compliance === "completed" || athActDates.has(s.sessionDate)
    ).length;
    const missed = sessions.filter(s => logs[s.id]?.analysis?.compliance === "missed").length;
    const rate   = total ? Math.round((done/total)*100) : 0;
    return { total, done, missed, rate };
  };

  // ────────────────────────────────────────────────────────────
  //  LOADING
  // ────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:32, marginBottom:16 }}>⏳</div>
        <div style={{ color:"#555", fontSize:14 }}>Loading...</div>
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
        <div style={{ fontSize:11, letterSpacing:5, color:"#E06666", textTransform:"uppercase", marginBottom:16 }}>Training Platform</div>
        <div style={{ fontSize:42, fontWeight:900, fontFamily:"'Georgia',serif", lineHeight:1.0, marginBottom:8 }}>FORM<br/>&amp; PACE</div>
        <div style={{ fontSize:14, color:"#555", marginBottom:56, lineHeight:1.6 }}>
          Expert coaching for<br/>distance runners
        </div>

        <button onClick={signInWithGoogle} style={{
          background:"white", color:"#111", border:"none", borderRadius:12,
          padding:"16px 28px", fontSize:15, fontWeight:700, cursor:"pointer",
          display:"flex", alignItems:"center", gap:12, margin:"0 auto",
          boxShadow:"0 2px 20px rgba(0,0,0,0.4)",
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
          <div style={{ marginTop:20, color:"#f87171", fontSize:13 }}>{authError}</div>
        )}

        <div style={{ marginTop:48, fontSize:12, color:"#333", lineHeight:1.8 }}>
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
        <div style={{ fontSize:20, fontWeight:700, marginBottom:12 }}>You're not enrolled yet</div>
        <div style={{ fontSize:14, color:"#666", lineHeight:1.8, marginBottom:32 }}>
          Your coach needs to add you to the platform.<br/>
          Share your email with them:<br/>
          <span style={{ color:"#E06666", fontFamily:"monospace", fontSize:13, marginTop:8, display:"block" }}>{user.email}</span>
        </div>
        <button onClick={signOut} style={S.ghostBtn}>Sign out</button>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  COACH DASHBOARD
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "dashboard") {
    const athletes = Object.entries(ATHLETE_PROGRAMS);
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
              { label:"Avg Compliance", val: athletes.length ? Math.round(athletes.reduce((a,[e])=>a+getStats(e).rate,0)/athletes.length)+"%" : "–" },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:24, fontWeight:900 }}>{s.val}</div>
                <div style={{ fontSize:9, color:"#555", letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Athlete cards */}
          {athletes.map(([email, data]) => {
            const st = getStats(email);
            const recentSessions = data.weeks.flatMap(w=>w.sessions).filter(s=>logs[s.id]).slice(-3);
            const thisWeekKm = weekKm(activities, email, 0);
            return (
              <div key={email} onClick={()=>{ setDashAthlete(email); setCoachScreen("athlete"); }}
                style={{ ...S.card, marginBottom:12, cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:14 }}>
                  <div style={{ width:46, height:46, borderRadius:"50%", background:"#E06666", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900, fontSize:14, flexShrink:0 }}>
                    {data.avatar}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:16 }}>{data.name}</div>
                    <div style={{ fontSize:12, color:"#555", marginTop:2 }}>Goal: {data.goal} · PB: {data.current}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:"#f0ece4" }}>{thisWeekKm.toFixed(1)}</div>
                    <div style={{ fontSize:9, color:"#555", letterSpacing:1, textTransform:"uppercase" }}>km/wk</div>
                  </div>
                  <div style={{ color:"#333", fontSize:20 }}>›</div>
                </div>
                <div style={{ background:"#0a0a0a", borderRadius:6, height:5, marginBottom:8 }}>
                  <div style={{ width:`${st.rate}%`, height:5, borderRadius:6, background: st.rate>75?"#4ade80":st.rate>40?"#fbbf24":"#f87171", transition:"width 0.5s" }}/>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#555" }}>
                  <span>{st.done}/{st.total} sessions · {st.rate}% compliance</span>
                  {st.missed > 0 && <span style={{ color:"#f87171" }}>{st.missed} missed</span>}
                </div>
                {recentSessions.length > 0 && (
                  <div style={{ marginTop:10, display:"flex", gap:6, alignItems:"center" }}>
                    {recentSessions.map(s=>(
                      <span key={s.id} style={{ background:"#1a1a1a", borderRadius:6, padding:"3px 8px", fontSize:16 }}>
                        {logs[s.id]?.analysis?.emoji || "📝"}
                      </span>
                    ))}
                    <span style={{ fontSize:11, color:"#444", marginLeft:2 }}>recent</span>
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
  //  COACH → ATHLETE DETAIL
  // ────────────────────────────────────────────────────────────
  if (role === "coach" && coachScreen === "athlete" && dashAthlete) {
    const da  = ATHLETE_PROGRAMS[dashAthlete];
    const st  = getStats(dashAthlete);
    const athWeekKm = weekKm(activities, dashAthlete, 0);
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={da.name} subtitle={`Goal: ${da.goal}`} onBack={()=>setCoachScreen("dashboard")}
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>

          <div style={{ display:"flex", gap:10, marginBottom:24 }}>
            {[
              { label:"Compliance", val:`${st.rate}%`, color: st.rate>75?"#4ade80":st.rate>40?"#fbbf24":"#f87171" },
              { label:"Completed",  val: st.done,   color:"#4ade80" },
              { label:"Missed",     val: st.missed,  color: st.missed>0?"#f87171":"#888" },
              { label:"Km This Wk", val:`${athWeekKm.toFixed(1)}`, color:"#f0ece4" },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:24, fontWeight:900, color:s.color||"#f0ece4" }}>{s.val}</div>
                <div style={{ fontSize:9, color:"#555", letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <MonthlySummaryCard
            summary={monthlySummaries[dashAthlete]}
            loading={summaryLoading}
            onGenerate={() => generateMonthlySummary(dashAthlete)}
            isCoach={true}
          />

          {(() => {
            const athActs    = activities.filter(a => a.athlete_email === dashAthlete?.toLowerCase());
            const athActDates = new Set(athActs.map(a => a.activity_date));
            return da.weeks.map((wk,wi) => {
              const wkEnd = (() => { const d = new Date(wk.weekStart + "T00:00:00"); d.setDate(d.getDate() + 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
              const extraActs = athActs.filter(a => a.source === "manual" && a.activity_date >= wk.weekStart && a.activity_date <= wkEnd);
              return (
                <div key={wi} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, letterSpacing:3, color:"#444", textTransform:"uppercase", marginBottom:10, paddingLeft:4 }}>{wk.weekLabel}</div>
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
                          supabase.from("session_logs").select("*").eq("session_id", s.id).single().then(({ data }) => {
                            if (data) setLogs(prev => ({ ...prev, [s.id]: data }));
                          });
                        }}
                        style={{ ...S.card, marginBottom:8, cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                        <div style={{ fontSize:22 }}>{log?.analysis?.emoji || "⏳"}</div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <div style={{ fontWeight:700, fontSize:14 }}>{s.day} · {s.type}</div>
                            <div style={{ fontSize:11, color: COMPLY_COLOR[comply], fontWeight:700 }}>{COMPLY_LABEL[comply]}</div>
                          </div>
                          {log?.analysis?.distance_km && (
                            <div style={{ fontSize:12, color:"#666", marginTop:3 }}>{log.analysis.distance_km}km{log.analysis.duration_min ? ` · ${log.analysis.duration_min}min` : ""}</div>
                          )}
                          {log?.coach_reply && <div style={{ fontSize:11, color:"#3b82f6", marginTop:3 }}>💬 You replied</div>}
                        </div>
                        <div style={{ color:"#333" }}>›</div>
                      </div>
                    );
                  })}
                  {extraActs.map(act => (
                    <div key={act.id} style={{ ...S.card, marginBottom:8, display:"flex", alignItems:"center", gap:12, background:"#1a0505", border:"1px solid #7f1d1d" }}>
                      <div style={{ fontSize:22 }}>➕</div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div style={{ fontWeight:700, fontSize:14 }}>{act.activity_date.slice(5).replace("-"," ")} · Extra Run</div>
                          <div style={{ fontSize:11, color:"#888", fontWeight:700 }}>EXTRA</div>
                        </div>
                        <div style={{ fontSize:12, color:"#666", marginTop:3 }}>
                          {act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds/60)}min` : ""}
                          {act.notes ? ` — ${act.notes}` : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            });
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
    const linkedAthAct = coachSDate ? activities.find(a => a.athlete_email === activeSession.athleteEmail?.toLowerCase() && a.activity_date === coachSDate) : null;
    const sessionLogged = !!log || !!linkedAthAct;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>setCoachScreen("athlete")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>

          <SectionCard label="Prescribed Session">
            {activeSession.desc.split("\n").map((l,i)=>(
              <div key={i} style={{ fontSize:14, color:i===0?"#f0ece4":"#888", lineHeight:1.9 }}>{l}</div>
            ))}
            <div style={{ display:"flex", gap:20, marginTop:12, paddingTop:12, borderTop:"1px solid #1e1e1e" }}>
              <MiniStat label="Terrain" val={activeSession.terrain}/>
              <MiniStat label="Target Pace" val={activeSession.pace} color="#E06666"/>
            </div>
          </SectionCard>

          {!sessionLogged ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#444", fontSize:14 }}>Athlete hasn't logged this session yet.</div>
          ) : (
            <>
              {(() => {
                const distKm   = an?.distance_km ?? linkedAthAct?.distance_km;
                const durSecs  = linkedAthAct?.duration_seconds;
                const durMin   = an?.duration_min ?? (durSecs ? Math.round(durSecs / 60) : null);
                const notes    = log?.feedback || linkedAthAct?.notes;
                return (<>
                  <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                    {distKm  && <StatPill label="Distance" val={`${distKm}km`}  color="#4ade80"/>}
                    {durMin  && <StatPill label="Duration" val={`${durMin}min`}/>}
                  </div>
                  {notes ? (
                    <SectionCard label="Athlete's Notes">
                      <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8, fontStyle:"italic" }}>"{notes}"</div>
                    </SectionCard>
                  ) : (
                    <div style={{ fontSize:13, color:"#444", textAlign:"center", padding:"8px 0 16px" }}>No notes submitted.</div>
                  )}
                </>);
              })()}

              {log && <SectionCard label="💬 Your Reply">
                {log.coach_reply ? (
                  <>
                    <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8, marginBottom:12 }}>{log.coach_reply}</div>
                    <button onClick={()=>{ saveLog(activeSession.id,{...log,coach_reply:""}); }} style={S.ghostBtn}>Edit reply</button>
                  </>
                ) : (
                  <>
                    <textarea value={coachReply} onChange={e=>setCoachReply(e.target.value)}
                      placeholder="Write a note back to the athlete..."
                      style={{ ...S.textarea, minHeight:90 }}/>
                    <button onClick={()=>handleCoachReply(activeSession.id)} disabled={!coachReply.trim()}
                      style={S.primaryBtn("#3b82f6", !coachReply.trim())}>
                      Send Reply →
                    </button>
                  </>
                )}
              </SectionCard>}
            </>
          )}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — HOME
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "home") {
    const week = weeks[activeWeekIdx];
    const weekBars = [3,2,1,0].map(ago => ({ km: weekKm(activities, user.email, ago), weeksAgo: ago }));
    const maxBarKm = Math.max(...weekBars.map(b => b.km), 1);
    const thisWeekKm = weekBars[3].km;
    const actByDate = {};
    activities.filter(a => a.athlete_email === user.email?.toLowerCase()).forEach(a => {
      if (!actByDate[a.activity_date]) actByDate[a.activity_date] = a;
    });
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header
          title={athleteData.name}
          subtitle="Training Log"
          right={<button onClick={signOut} style={S.signOutBtn}>Sign out</button>}
        />
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 0 80px" }}>

          <div style={{ margin:"20px 16px", background:"#161616", border:"1px solid #222", borderLeft:"3px solid #E06666", borderRadius:8, padding:"14px 18px" }}>
            <div style={{ fontSize:10, letterSpacing:3, color:"#E06666", textTransform:"uppercase", marginBottom:4 }}>Season Goal</div>
            <div style={{ fontSize:18, fontWeight:900 }}>{athleteData.goal}</div>
            <div style={{ fontSize:12, color:"#555", marginTop:3 }}>Current PB: {athleteData.current}</div>
          </div>

          {/* Weekly Progress */}
          <div style={{ margin:"0 16px 16px", background:"#161616", border:"1px solid #1e1e1e", borderRadius:8, padding:"14px 18px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
              <div>
                <div style={{ fontSize:10, letterSpacing:3, color:"#555", textTransform:"uppercase", marginBottom:4 }}>This Week</div>
                <div style={{ fontSize:26, fontWeight:900, color:"#f0ece4" }}>{thisWeekKm.toFixed(1)} <span style={{ fontSize:14, color:"#555", fontWeight:400 }}>km</span></div>
              </div>
              <button onClick={()=>{ setLogForm({ date: new Date().toISOString().split("T")[0], distanceKm:"", durationMin:"", type:"Run", notes:"" }); setScreen("log-activity"); }}
                style={{ background:"#E06666", border:"none", borderRadius:8, padding:"8px 14px", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", letterSpacing:1 }}>
                + LOG RUN
              </button>
            </div>
            <div style={{ display:"flex", gap:4, alignItems:"flex-end", height:48 }}>
              {weekBars.map((b, i) => {
                const pct = maxBarKm > 0 ? (b.km / maxBarKm) : 0;
                const isCurrent = b.weeksAgo === 0;
                return (
                  <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ fontSize:9, color:isCurrent?"#f0ece4":"#444" }}>{b.km > 0 ? b.km.toFixed(0) : ""}</div>
                    <div style={{ width:"100%", height:32, display:"flex", alignItems:"flex-end" }}>
                      <div style={{ width:"100%", height:`${Math.max(pct*100,4)}%`, background:isCurrent?"#E06666":"#2a2a2a", borderRadius:"3px 3px 0 0", transition:"height 0.4s" }}/>
                    </div>
                    <div style={{ fontSize:8, color:"#444", letterSpacing:1 }}>{["W-3","W-2","W-1","NOW"][i]}</div>
                  </div>
                );
              })}
            </div>
            {activities.filter(a=>a.athlete_email===user.email).length===0 && (
              <div style={{ marginTop:10, fontSize:11, color:"#444", textAlign:"center" }}>Log your first run to start tracking km</div>
            )}
          </div>


          {/* Monthly block summary (read-only for athlete) */}
          {monthlySummaries[user.email] && (
            <div style={{ margin:"0 16px 16px" }}>
              <MonthlySummaryCard
                summary={monthlySummaries[user.email]}
                loading={false}
                isCoach={false}
              />
            </div>
          )}

          <div style={{ display:"flex", gap:8, padding:"0 16px", marginBottom:16, overflowX:"auto" }}>
            {weeks.map((w,i)=>(
              <button key={i} onClick={()=>setActiveWeekIdx(i)} style={{
                background: i===activeWeekIdx?"#E06666":"#161616",
                border:`1px solid ${i===activeWeekIdx?"#E06666":"#222"}`,
                borderRadius:20, padding:"6px 14px",
                color: i===activeWeekIdx?"white":"#666",
                fontSize:11, cursor:"pointer", whiteSpace:"nowrap", letterSpacing:1,
              }}>WK {i+1}</button>
            ))}
            <button onClick={()=>setScreen("history")} style={{
              background:"#161616", border:"1px solid #222", borderRadius:20,
              padding:"6px 14px", color:"#555", fontSize:11, cursor:"pointer", whiteSpace:"nowrap",
            }}>HISTORY →</button>
          </div>

          <div style={{ padding:"0 16px 10px", fontSize:12, color:"#444" }}>{week?.weekLabel}</div>

          <div style={{ padding:"0 16px" }}>
            {week?.sessions.map(s => {
              const log = logs[s.id];
              const ts  = TAG_STYLE[s.tag];
              const sDate = week ? sessionDateStr(week.weekStart, s.day) : null;
              const linkedAct = sDate ? actByDate[sDate] : null;
              const isLogged = !!log || !!linkedAct;
              const hasFullFeedback = log?.feedback && log.feedback.trim().length > 0;
              return (
                <div key={s.id}
                  onClick={()=>{ setActiveSession({...s, weekStart: week.weekStart}); setFeedbackText(""); setSessionDistKm(""); setSessionDurMin(""); setScreen((log && hasFullFeedback) ? "result" : "session"); }}
                  style={{ background:isLogged?"#0d1f0d":"#161616", border:`1px solid ${isLogged?"#166534":"#1e1e1e"}`, borderRadius:12, padding:"16px 18px", marginBottom:10, cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:42, height:42, borderRadius:"50%", background:ts.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                    {log?.analysis?.emoji || (s.tag==="speed"?"⚡":s.tag==="tempo"?"🎯":"🏃")}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div style={{ fontSize:12, color:"#555" }}>{s.day}</div>
                      {isLogged && <div style={{ fontSize:11, color:"#4ade80" }}>✓ LOGGED</div>}
                    </div>
                    <div style={{ fontWeight:700, fontSize:15, marginTop:2 }}>{s.type}</div>
                    <div style={{ fontSize:11, color:ts.accent, marginTop:2, fontFamily:"monospace" }}>{s.pace}</div>
                    {linkedAct && <div style={{ fontSize:11, color:"#888", marginTop:3 }}>{linkedAct.distance_km}km{linkedAct.duration_seconds ? ` · ${Math.round(linkedAct.duration_seconds/60)}min` : ""}</div>}
                    {log?.coach_reply && <div style={{ fontSize:11, color:"#3b82f6", marginTop:3 }}>💬 Coach replied</div>}
                  </div>
                  <div style={{ color:"#2a2a2a", fontSize:18 }}>›</div>
                </div>
              );
            })}
            {(() => {
              if (!week) return null;
              const wkEnd = (() => { const d = new Date(week.weekStart + "T00:00:00"); d.setDate(d.getDate() + 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
              const extraActs = activities.filter(a =>
                a.athlete_email === user.email?.toLowerCase() &&
                a.source === "manual" &&
                a.activity_date >= week.weekStart &&
                a.activity_date <= wkEnd
              );
              return extraActs.map(act => (
                <div key={act.id} style={{ background:"#1a0505", border:"1px solid #7f1d1d", borderRadius:12, padding:"16px 18px", marginBottom:10, display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:42, height:42, borderRadius:"50%", background:"#3b0a0a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>➕</div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div style={{ fontSize:12, color:"#888" }}>{act.activity_date.slice(5).replace("-"," ")}</div>
                      <div style={{ fontSize:11, color:"#E06666" }}>EXTRA RUN</div>
                    </div>
                    <div style={{ fontWeight:700, fontSize:15, marginTop:2 }}>{act.activity_type || "Run"}</div>
                    <div style={{ fontSize:11, color:"#888", marginTop:2 }}>{act.distance_km}km{act.duration_seconds ? ` · ${Math.round(act.duration_seconds/60)}min` : ""}</div>
                    {act.notes && <div style={{ fontSize:11, color:"#666", marginTop:3, fontStyle:"italic" }}>"{act.notes}"</div>}
                  </div>
                </div>
              ));
            })()}
          </div>
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
        <Header title="Log Activity" subtitle="Manual Entry" onBack={()=>setScreen("home")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"20px 16px 80px" }}>
          <SectionCard label="Activity Details">
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Date</div>
              <input
                type="date"
                value={logForm.date}
                onChange={e=>setLogForm(f=>({...f, date:e.target.value}))}
                style={{ ...S.input }}
              />
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Activity Type</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {activityTypes.map(t=>(
                  <button key={t} onClick={()=>setLogForm(f=>({...f, type:t}))}
                    style={{ background:logForm.type===t?"#E06666":"#1a1a1a", border:`1px solid ${logForm.type===t?"#E06666":"#2a2a2a"}`, borderRadius:20, padding:"5px 12px", color:logForm.type===t?"white":"#888", fontSize:12, cursor:"pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:12, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Distance (km)</div>
                <input
                  type="number" step="0.01" min="0" placeholder="e.g. 10.5"
                  value={logForm.distanceKm}
                  onChange={e=>setLogForm(f=>({...f, distanceKm:e.target.value}))}
                  style={{ ...S.input }}
                />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Duration (min)</div>
                <input
                  type="number" step="1" min="0" placeholder="e.g. 55"
                  value={logForm.durationMin}
                  onChange={e=>setLogForm(f=>({...f, durationMin:e.target.value}))}
                  style={{ ...S.input }}
                />
              </div>
            </div>
            <div>
              <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Notes (optional)</div>
              <textarea
                placeholder="How did it feel? Any highlights?"
                value={logForm.notes}
                onChange={e=>setLogForm(f=>({...f, notes:e.target.value}))}
                style={{ ...S.textarea, minHeight:80 }}
              />
            </div>
          </SectionCard>
          <button onClick={()=>saveActivity(logForm)} disabled={!canSubmit||logSaving}
            style={S.primaryBtn("#E06666", !canSubmit||logSaving)}>
            {logSaving ? "Saving..." : "Save Activity →"}
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — SESSION LOG
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "session" && activeSession) return (
    <div style={S.page}>
      <div style={S.grain}/>
      <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>setScreen("home")}/>
      <div style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}>
        <SectionCard label="Today's Session">
          {activeSession.desc.split("\n").map((l,i)=>(
            <div key={i} style={{ fontSize:14, color:i===0?"#f0ece4":"#aaa", lineHeight:1.9 }}>{l}</div>
          ))}
          <div style={{ display:"flex", gap:20, marginTop:12, paddingTop:12, borderTop:"1px solid #1e1e1e" }}>
            <MiniStat label="Terrain" val={activeSession.terrain}/>
            <MiniStat label="Target Pace" val={activeSession.pace} color="#E06666"/>
          </div>
        </SectionCard>
        <div style={{ display:"flex", gap:12, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Distance (km)</div>
            <input type="number" step="0.01" min="0" placeholder="e.g. 10.5"
              value={sessionDistKm} onChange={e=>setSessionDistKm(e.target.value)}
              style={S.input}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Duration (min)</div>
            <input type="number" step="1" min="0" placeholder="e.g. 55"
              value={sessionDurMin} onChange={e=>setSessionDurMin(e.target.value)}
              style={S.input}/>
          </div>
        </div>
        <div style={{ fontSize:11, letterSpacing:2, color:"#666", textTransform:"uppercase", marginBottom:10 }}>How did it go?</div>
        <textarea value={feedbackText} onChange={e=>setFeedbackText(e.target.value)}
          placeholder="Tell me about the session... how did it feel? Did you hit the paces? Any soreness or highlights?"
          style={S.textarea}/>


        <button onClick={handleSubmitFeedback}
          disabled={!sessionDistKm||isSaving}
          style={S.primaryBtn("#E06666", !sessionDistKm||isSaving)}>
          {isSaving ? "Saving..." : "Save Session →"}
        </button>
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  ATHLETE — RESULT
  // ────────────────────────────────────────────────────────────
  if (role === "athlete" && screen === "result" && activeSession) {
    const log = logs[activeSession.id];
    const an  = log?.analysis;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title={activeSession.type} subtitle={activeSession.day} onBack={()=>setScreen("home")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"0 16px 80px" }}>
          <div style={{ textAlign:"center", fontSize:64, margin:"20px 0 8px" }}>{an?.emoji || "✓"}</div>
          <div style={{ textAlign:"center", fontSize:14, color:"#4ade80", fontWeight:700, marginBottom:20, letterSpacing:1 }}>SESSION LOGGED</div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {an?.distance_km && <StatPill label="Distance" val={`${an.distance_km}km`} color="#4ade80"/>}
            {an?.duration_min && <StatPill label="Duration" val={`${an.duration_min}min`}/>}
          </div>
          {(log?.feedback || feedbackText) && (
            <SectionCard label="Your Notes">
              <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8, fontStyle:"italic" }}>"{log?.feedback || feedbackText}"</div>
            </SectionCard>
          )}
          {log?.coach_reply && (
            <SectionCard label="💬 Message from Coach" accent="#3b82f6">
              <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8 }}>{log.coach_reply}</div>
            </SectionCard>
          )}
          <button onClick={()=>setScreen("home")} style={S.ghostBtn}>← Back to week</button>
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
              { label:"Block Km",   val:`${totalKm.toFixed(0)}`, color:"#f0ece4" },
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:20, fontWeight:900, color:s.color||"#f0ece4" }}>{s.val}</div>
                <div style={{ fontSize:9, color:"#555", letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
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
                    <span style={{ color:"#888" }}>{w.weekLabel}</span>
                    <span style={{ color: pct>75?"#4ade80":pct>40?"#fbbf24":"#f87171" }}>{done}/{w.sessions.length}</span>
                  </div>
                  <div style={{ background:"#0a0a0a", borderRadius:4, height:4 }}>
                    <div style={{ width:`${pct}%`, height:4, borderRadius:4, background: pct>75?"#4ade80":pct>40?"#fbbf24":"#f87171" }}/>
                  </div>
                </div>
              );
            })}
          </SectionCard>
          <div style={{ fontSize:11, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:12 }}>Session Log</div>
          {logged.length===0 && <div style={{ color:"#444", fontSize:14, textAlign:"center", padding:"20px 0" }}>No sessions logged yet.</div>}
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
                    <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
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

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function Header({ title, subtitle, right, onBack }) {
  return (
    <div style={{ background:"#0f0f0f", borderBottom:"1px solid #1a1a1a", padding:"16px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
      {onBack && <button onClick={onBack} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:22, padding:"0 6px 0 0", lineHeight:1 }}>‹</button>}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, color:"#444", letterSpacing:2, textTransform:"uppercase" }}>{subtitle}</div>
        <div style={{ fontSize:17, fontWeight:800, fontFamily:"'Georgia',serif", color:"#f0ece4" }}>{title}</div>
      </div>
      {right}
    </div>
  );
}
function SectionCard({ label, children, accent }) {
  return (
    <div style={{ background:"#161616", border:`1px solid ${accent?"#222":"#1a1a1a"}`, borderLeft:`3px solid ${accent||"#1a1a1a"}`, borderRadius:10, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ fontSize:10, letterSpacing:2, color:accent||"#444", textTransform:"uppercase", marginBottom:10 }}>{label}</div>
      {children}
    </div>
  );
}
function StatPill({ label, val, color }) {
  return (
    <div style={{ flex:1, background:"#161616", border:"1px solid #1a1a1a", borderRadius:10, padding:"14px 8px", textAlign:"center" }}>
      <div style={{ fontSize:10, color:"#444", letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:800, color:color||"#f0ece4" }}>{val}</div>
    </div>
  );
}
function MiniStat({ label, val, color }) {
  return (
    <div>
      <div style={{ fontSize:10, color:"#444", letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:13, color:color||"#f0ece4", fontWeight:600 }}>{val}</div>
    </div>
  );
}

function MonthlySummaryCard({ summary, loading, onGenerate, isCoach }) {
  if (loading) return (
    <div style={{ background:"#161616", border:"1px solid #222", borderRadius:10, padding:"20px 18px", marginBottom:20, textAlign:"center" }}>
      <div style={{ fontSize:13, color:"#555" }}>Generating block summary...</div>
    </div>
  );
  if (!summary) {
    if (!isCoach) return null;
    return (
      <button onClick={onGenerate}
        style={{ width:"100%", background:"#161616", border:"1px dashed #333", borderRadius:10, padding:"16px", marginBottom:20, color:"#555", fontSize:12, cursor:"pointer", letterSpacing:1, textTransform:"uppercase" }}>
        + Generate 4-Week Block Summary
      </button>
    );
  }
  return (
    <div style={{ background:"#161616", border:"1px solid #222", borderLeft:"3px solid #E06666", borderRadius:10, padding:"18px", marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
        <div style={{ fontSize:10, letterSpacing:3, color:"#E06666", textTransform:"uppercase" }}>4-Week Block Summary</div>
        {isCoach && (
          <button onClick={onGenerate}
            style={{ background:"none", border:"none", color:"#444", fontSize:11, cursor:"pointer", padding:0 }}>
            Regenerate
          </button>
        )}
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:"#f0ece4", marginBottom:14, lineHeight:1.4 }}>{summary.headline}</div>

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:10, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:6 }}>Wins</div>
        {summary.wins?.map((w, i) => (
          <div key={i} style={{ fontSize:12, color:"#4ade80", marginBottom:4 }}>✓ {w}</div>
        ))}
      </div>

      {summary.watchPoints?.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:6 }}>Watch</div>
          {summary.watchPoints.map((w, i) => (
            <div key={i} style={{ fontSize:12, color:"#fbbf24", marginBottom:4 }}>⚠ {w}</div>
          ))}
        </div>
      )}

      <div style={{ borderTop:"1px solid #1e1e1e", paddingTop:12, marginTop:4 }}>
        <div style={{ fontSize:10, letterSpacing:2, color:"#444", textTransform:"uppercase", marginBottom:4 }}>Next Block Focus</div>
        <div style={{ fontSize:13, color:"#f0ece4", lineHeight:1.5 }}>{summary.nextBlockFocus}</div>
      </div>

      <div style={{ marginTop:10, fontSize:11, color:"#555", fontStyle:"italic" }}>{summary.volumeTrend}</div>
      {summary.generatedAt && (
        <div style={{ marginTop:8, fontSize:10, color:"#333" }}>
          Generated {new Date(summary.generatedAt).toLocaleDateString("en-AU",{day:"numeric",month:"short"})}
        </div>
      )}
    </div>
  );
}


// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  page:       { minHeight:"100vh", background:"#0c0c0c", fontFamily:"'Georgia',serif", color:"#f0ece4", position:"relative" },
  grain:      { position:"fixed", inset:0, backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E\")", pointerEvents:"none", zIndex:0 },
  card:       { background:"#161616", border:"1px solid #1a1a1a", borderRadius:12, padding:"16px 18px" },
  statBox:    { flex:1, background:"#161616", border:"1px solid #1a1a1a", borderRadius:10, padding:"14px 10px", textAlign:"center" },
  textarea:   { width:"100%", background:"#161616", border:"1px solid #222", borderRadius:12, padding:"16px", color:"#f0ece4", fontSize:15, lineHeight:1.7, resize:"none", minHeight:130, boxSizing:"border-box", fontFamily:"Georgia,serif", outline:"none", marginBottom:14, display:"block" },
  input:      { width:"100%", background:"#161616", border:"1px solid #222", borderRadius:10, padding:"12px 14px", color:"#f0ece4", fontSize:15, boxSizing:"border-box", fontFamily:"Georgia,serif", outline:"none", display:"block", colorScheme:"dark" },
  primaryBtn: (c, dis) => ({ width:"100%", background:dis?"#1a1a1a":c, color:dis?"#333":"white", border:"none", borderRadius:12, padding:"17px", fontSize:15, fontWeight:700, cursor:dis?"not-allowed":"pointer", letterSpacing:1, display:"block" }),
  ghostBtn:   { width:"100%", background:"#161616", border:"1px solid #1e1e1e", borderRadius:12, padding:"15px", color:"#666", fontSize:14, cursor:"pointer", marginTop:8, fontFamily:"Georgia,serif", display:"block" },
  signOutBtn: { background:"none", border:"1px solid #2a2a2a", borderRadius:8, padding:"5px 12px", color:"#555", fontSize:11, cursor:"pointer", letterSpacing:1 },
};
