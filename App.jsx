import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── COACH EMAILS ─────────────────────────────────────────────────────────────
// Add your email here — anyone not on this list is treated as an athlete
const COACH_EMAILS = [
  "degitzachary@gmail.com",
];

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const ATHLETE_PROGRAMS = {
  "siouxsie@email.com": {
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

// ─── STRAVA HELPERS ───────────────────────────────────────────────────────────
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${m}:${String(s).padStart(2,"0")}`;
}
function formatPace(metersPerSec) {
  if (!metersPerSec) return "–";
  const sPerKm = 1000 / metersPerSec;
  return `${Math.floor(sPerKm/60)}:${String(Math.round(sPerKm%60)).padStart(2,"0")} /km`;
}
function formatDist(meters) { return (meters/1000).toFixed(2) + " km"; }
function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"});
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
  const [aiLoading,     setAiLoading]     = useState(false);

  // Coach state
  const [coachScreen,   setCoachScreen]   = useState("dashboard");
  const [dashAthlete,   setDashAthlete]   = useState(null);
  const [coachReply,    setCoachReply]    = useState("");

  // Logs stored in Supabase — keyed by session_id
  const [logs,          setLogs]          = useState({});
  const [logsLoading,   setLogsLoading]   = useState(false);

  // Strava state
  const [stravaConnected,       setStravaConnected]       = useState(false);
  const [stravaActivities,      setStravaActivities]      = useState([]);
  const [stravaLoading,         setStravaLoading]         = useState(false);
  const [selectedStrava,        setSelectedStrava]        = useState(null);
  const [showActivityPicker,    setShowActivityPicker]    = useState(false);

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

  const resolveUser = (u) => {
    const email = u.email?.toLowerCase();
    const r = COACH_EMAILS.includes(email) ? "coach" : "athlete";
    setUser(u);
    setRole(r);
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

  const saveLog = async (sessionId, updates) => {
    const existing = logs[sessionId];
    const payload = {
      session_id: sessionId,
      athlete_email: user.email,
      athlete_name: athleteData?.name || user.user_metadata?.full_name || user.email,
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("session_logs")
      .upsert(payload, { onConflict: "session_id" })
      .select()
      .single();
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
    setUser(null); setRole(null); setLogs({});
    setStravaConnected(false); setStravaActivities([]); setSelectedStrava(null);
  };

  // ── Strava ──
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

  const connectStrava = () => {
    const params = new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: window.location.origin,
      response_type: "code",
      scope: "activity:read_all",
    });
    window.location.href = `https://www.strava.com/oauth/authorize?${params}`;
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

  const loadStravaActivities = async () => {
    if (stravaActivities.length > 0) { setShowActivityPicker(true); return; }
    setStravaLoading(true);
    try {
      const data = await stravaCall("list", { per_page: 15 });
      if (Array.isArray(data)) {
        setStravaActivities(data.filter(a => ["Run","TrailRun","VirtualRun"].includes(a.type)));
        setShowActivityPicker(true);
      }
    } catch (e) { console.error(e); }
    setStravaLoading(false);
  };

  // ── Resolve athlete program ──
  const athleteEmail = user?.email?.toLowerCase();
  const athleteData  = ATHLETE_PROGRAMS[athleteEmail] || null;
  const weeks        = athleteData?.weeks || [];
  const allSessions  = weeks.flatMap(w => w.sessions);

  // ── AI analysis ──
  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim() || !activeSession) return;
    setAiLoading(true);
    const s = activeSession;
    const sys = `You are an elite running coach's AI assistant. Analyse athlete feedback. Respond ONLY with valid JSON, no markdown, no backticks.`;
    const msg = `Athlete: ${athleteData?.name} | Goal: ${athleteData?.goal} | PB: ${athleteData?.current}
Session: ${s.type} — ${s.day}
Prescribed: ${s.desc}
Target pace: ${s.pace}
Athlete feedback: "${feedbackText}"

Return JSON:
{
  "rpe": <1-10 or null>,
  "paceStatus": "on target"|"faster"|"slower"|"unknown",
  "feelStatus": "great"|"good"|"average"|"struggled"|"unknown",
  "compliance": "completed"|"partial"|"missed",
  "keyInsight": "<12 words max>",
  "coachNote": "<2-3 sentences>",
  "emoji": "<single emoji>"
}`;
    try {
      const raw = await callClaude(sys, msg);
      const analysis = JSON.parse(raw.replace(/```json|```/g,"").trim());
      const updates = { feedback: feedbackText, analysis };
      if (selectedStrava) {
        updates.strava_data = {
          id: selectedStrava.id,
          name: selectedStrava.name,
          distance: selectedStrava.distance,
          moving_time: selectedStrava.moving_time,
          average_speed: selectedStrava.average_speed,
          average_heartrate: selectedStrava.average_heartrate,
          max_heartrate: selectedStrava.max_heartrate,
          total_elevation_gain: selectedStrava.total_elevation_gain,
          start_date: selectedStrava.start_date_local,
          splits_metric: selectedStrava.splits_metric,
          url: `https://www.strava.com/activities/${selectedStrava.id}`,
        };
      }
      await saveLog(s.id, updates);
      setSelectedStrava(null);
      setScreen("result");
    } catch(e) { console.error(e); }
    setAiLoading(false);
  };

  // ── Coach reply ──
  const handleCoachReply = async (sessionId) => {
    if (!coachReply.trim()) return;
    await saveLog(sessionId, { ...logs[sessionId], coach_reply: coachReply });
    setCoachReply("");
  };

  // ── Compliance stats ──
  const getStats = (email) => {
    const sessions = (ATHLETE_PROGRAMS[email]?.weeks || []).flatMap(w => w.sessions);
    const total  = sessions.length;
    const done   = sessions.filter(s => logs[s.id]?.analysis?.compliance === "completed").length;
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
          AI-powered coaching for<br/>distance runners
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
            ].map((s,i)=>(
              <div key={i} style={S.statBox}>
                <div style={{ fontSize:24, fontWeight:900, color:s.color||"#f0ece4" }}>{s.val}</div>
                <div style={{ fontSize:9, color:"#555", letterSpacing:2, textTransform:"uppercase", marginTop:4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {da.weeks.map((wk,wi) => (
            <div key={wi} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, letterSpacing:3, color:"#444", textTransform:"uppercase", marginBottom:10, paddingLeft:4 }}>{wk.weekLabel}</div>
              {wk.sessions.map(s => {
                const log    = logs[s.id];
                const comply = log?.analysis?.compliance || "pending";
                return (
                  <div key={s.id}
                    onClick={()=>{ setActiveSession({...s, athleteEmail: dashAthlete}); setCoachScreen("session"); }}
                    style={{ ...S.card, marginBottom:8, cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ fontSize:22 }}>{log?.analysis?.emoji || "⏳"}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>{s.day} · {s.type}</div>
                        <div style={{ fontSize:11, color: COMPLY_COLOR[comply], fontWeight:700 }}>{COMPLY_LABEL[comply]}</div>
                      </div>
                      {log?.analysis?.keyInsight && (
                        <div style={{ fontSize:12, color:"#666", marginTop:3 }}>{log.analysis.keyInsight}</div>
                      )}
                      {log?.coach_reply && <div style={{ fontSize:11, color:"#3b82f6", marginTop:3 }}>💬 You replied</div>}
                    </div>
                    <div style={{ color:"#333" }}>›</div>
                  </div>
                );
              })}
            </div>
          ))}
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

          {!log ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:"#444", fontSize:14 }}>Athlete hasn't logged this session yet.</div>
          ) : (
            <>
              <div style={{ textAlign:"center", fontSize:56, margin:"16px 0 8px" }}>{an?.emoji}</div>
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                {an?.rpe && <StatPill label="RPE" val={`${an.rpe}/10`}/>}
                <StatPill label="Pace"  val={an?.paceStatus?.toUpperCase()}  color={{"on target":"#4ade80",faster:"#60a5fa",slower:"#f87171"}[an?.paceStatus]}/>
                <StatPill label="Feel"  val={an?.feelStatus?.toUpperCase()}  color={{"great":"#4ade80",good:"#a3e635",average:"#fbbf24",struggled:"#f87171"}[an?.feelStatus]}/>
              </div>
              <SectionCard label="Key Insight">
                <div style={{ fontSize:16, fontWeight:700, lineHeight:1.5 }}>{an?.keyInsight}</div>
              </SectionCard>
              <SectionCard label="AI Coaching Note">
                <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8 }}>{an?.coachNote}</div>
              </SectionCard>
              {log?.strava_data && <StravaCard data={log.strava_data} />}
              <SectionCard label="Athlete's Feedback">
                <div style={{ fontSize:13, color:"#777", lineHeight:1.7, fontStyle:"italic" }}>"{log.feedback}"</div>
              </SectionCard>

              <SectionCard label="💬 Your Reply">
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
              </SectionCard>
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

          {/* Strava connect banner */}
          {!stravaConnected && (
            <div onClick={connectStrava} style={{ margin:"0 16px 16px", background:"#1a1000", border:"1px solid #f97316", borderRadius:8, padding:"12px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:20 }}>🔗</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>Connect Strava</div>
                <div style={{ fontSize:11, color:"#666", marginTop:2 }}>Link your runs to session feedback</div>
              </div>
              <span style={{ color:"#f97316", fontSize:16 }}>›</span>
            </div>
          )}
          {stravaConnected && (
            <div style={{ margin:"0 16px 16px", background:"#0a1a0a", border:"1px solid #166534", borderRadius:8, padding:"10px 16px", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:16 }}>🟠</span>
              <div style={{ fontSize:12, color:"#4ade80", fontWeight:600 }}>Strava connected</div>
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
              return (
                <div key={s.id}
                  onClick={()=>{ setActiveSession(s); setFeedbackText(""); setScreen(log?"result":"session"); }}
                  style={{ background:log?"#0d1f0d":"#161616", border:`1px solid ${log?"#166534":"#1e1e1e"}`, borderRadius:12, padding:"16px 18px", marginBottom:10, cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:42, height:42, borderRadius:"50%", background:ts.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                    {log?.analysis?.emoji || (s.tag==="speed"?"⚡":s.tag==="tempo"?"🎯":"🏃")}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <div style={{ fontSize:12, color:"#555" }}>{s.day}</div>
                      {log && <div style={{ fontSize:11, color:"#4ade80" }}>✓ LOGGED</div>}
                    </div>
                    <div style={{ fontWeight:700, fontSize:15, marginTop:2 }}>{s.type}</div>
                    <div style={{ fontSize:11, color:ts.accent, marginTop:2, fontFamily:"monospace" }}>{s.pace}</div>
                    {log?.coach_reply && <div style={{ fontSize:11, color:"#3b82f6", marginTop:3 }}>💬 Coach replied</div>}
                  </div>
                  <div style={{ color:"#2a2a2a", fontSize:18 }}>›</div>
                </div>
              );
            })}
          </div>
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
        <div style={{ fontSize:11, letterSpacing:2, color:"#666", textTransform:"uppercase", marginBottom:10 }}>How did it go?</div>
        <textarea value={feedbackText} onChange={e=>setFeedbackText(e.target.value)}
          placeholder="Tell me about the session... how did it feel? Did you hit the paces? Any soreness or highlights?"
          style={S.textarea}/>

        {/* Strava Activity Linker */}
        {stravaConnected && (
          <div style={{ marginBottom:14 }}>
            {!selectedStrava ? (
              <button onClick={loadStravaActivities} disabled={stravaLoading}
                style={{ width:"100%", background:"#1a1000", border:"1px solid #f97316", borderRadius:12, padding:"14px", fontSize:14, fontWeight:600, color: stravaLoading?"#555":"#f97316", cursor: stravaLoading?"not-allowed":"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <span>🔗</span>
                {stravaLoading ? "Loading activities..." : "Link a Strava run (optional)"}
              </button>
            ) : (
              <div style={{ background:"#1a1000", border:"1px solid #f97316", borderRadius:12, padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontSize:12, color:"#f97316", fontWeight:700, marginBottom:4 }}>🟠 Linked Activity</div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{selectedStrava.name}</div>
                    <div style={{ fontSize:12, color:"#888", marginTop:3 }}>
                      {formatDist(selectedStrava.distance)} · {formatTime(selectedStrava.moving_time)} · {formatPace(selectedStrava.average_speed)}
                    </div>
                  </div>
                  <button onClick={()=>setSelectedStrava(null)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:18, padding:0 }}>✕</button>
                </div>
              </div>
            )}

            {showActivityPicker && (
              <div style={{ marginTop:8, background:"#111", border:"1px solid #222", borderRadius:12, overflow:"hidden" }}>
                <div style={{ padding:"10px 14px", borderBottom:"1px solid #1a1a1a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:11, letterSpacing:2, color:"#555", textTransform:"uppercase" }}>Recent Runs</div>
                  <button onClick={()=>setShowActivityPicker(false)} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:16 }}>✕</button>
                </div>
                <div style={{ maxHeight:280, overflowY:"auto" }}>
                  {stravaActivities.length === 0
                    ? <div style={{ padding:20, textAlign:"center", color:"#444", fontSize:13 }}>No recent runs found</div>
                    : stravaActivities.map(a => (
                      <div key={a.id} onClick={()=>{ setSelectedStrava(a); setShowActivityPicker(false); }}
                        style={{ padding:"12px 14px", borderBottom:"1px solid #1a1a1a", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{a.name}</div>
                          <div style={{ fontSize:11, color:"#666", marginTop:3 }}>
                            {formatDate(a.start_date_local)} · {formatDist(a.distance)} · {formatPace(a.average_speed)}
                          </div>
                        </div>
                        <div style={{ fontSize:12, color:"#f97316" }}>{formatTime(a.moving_time)}</div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={handleSubmitFeedback} disabled={!feedbackText.trim()||aiLoading}
          style={S.primaryBtn("#E06666", !feedbackText.trim()||aiLoading)}>
          {aiLoading ? "Analysing your session..." : "Submit Feedback →"}
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
          <div style={{ textAlign:"center", fontSize:64, margin:"20px 0 8px" }}>{an?.emoji}</div>
          <SectionCard label="Key Insight" accent="#E06666">
            <div style={{ fontSize:17, fontWeight:700, lineHeight:1.5 }}>{an?.keyInsight}</div>
          </SectionCard>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {an?.rpe && <StatPill label="RPE" val={`${an.rpe}/10`}/>}
            <StatPill label="Pace" val={an?.paceStatus?.toUpperCase()} color={{"on target":"#4ade80",faster:"#60a5fa",slower:"#f87171"}[an?.paceStatus]}/>
            <StatPill label="Feel" val={an?.feelStatus?.toUpperCase()} color={{"great":"#4ade80",good:"#a3e635",average:"#fbbf24",struggled:"#f87171"}[an?.feelStatus]}/>
          </div>
          <SectionCard label="Coach's Note">
            <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8 }}>{an?.coachNote}</div>
          </SectionCard>
          {log?.strava_data && <StravaCard data={log.strava_data} />}
          {log?.coach_reply && (
            <SectionCard label="💬 Message from Coach" accent="#3b82f6">
              <div style={{ fontSize:14, color:"#ccc", lineHeight:1.8 }}>{log.coach_reply}</div>
            </SectionCard>
          )}
          <SectionCard label="Your Feedback">
            <div style={{ fontSize:13, color:"#555", lineHeight:1.7, fontStyle:"italic" }}>"{log?.feedback}"</div>
          </SectionCard>
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
    const rpeVals    = logged.filter(s=>logs[s.id]?.analysis?.rpe);
    const avgRpe     = rpeVals.length ? (rpeVals.reduce((a,s)=>a+(logs[s.id].analysis.rpe||0),0)/rpeVals.length).toFixed(1) : "–";
    const onPace     = logged.filter(s=>logs[s.id]?.analysis?.paceStatus==="on target").length;
    const compliance = allSessions.length ? Math.round((logged.length/allSessions.length)*100) : 0;
    return (
      <div style={S.page}>
        <div style={S.grain}/>
        <Header title="My Progress" subtitle="Block 4" onBack={()=>setScreen("home")}/>
        <div style={{ maxWidth:500, margin:"0 auto", padding:"24px 16px 80px" }}>
          <div style={{ display:"flex", gap:10, marginBottom:24 }}>
            {[
              { label:"Compliance", val:`${compliance}%`, color: compliance>75?"#4ade80":"#fbbf24" },
              { label:"Sessions",   val:`${logged.length}/${allSessions.length}` },
              { label:"Avg RPE",    val: avgRpe },
              { label:"On Pace",    val: onPace, color:"#4ade80" },
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
            return (
              <div key={s.id} onClick={()=>{ setActiveSession(s); setScreen("result"); }}
                style={{ ...S.card, display:"flex", gap:12, alignItems:"center", marginBottom:8, cursor:"pointer" }}>
                <div style={{ fontSize:22 }}>{log?.analysis?.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}>{s.day} · {s.type}</div>
                  <div style={{ fontSize:12, color:"#555", marginTop:2 }}>{log?.analysis?.keyInsight}</div>
                </div>
                <div style={{ fontSize:11, color: COMPLY_COLOR[log?.analysis?.compliance||"pending"] }}>
                  {COMPLY_LABEL[log?.analysis?.compliance||"completed"]}
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

function StravaCard({ data }) {
  const splits = data.splits_metric?.slice(0,10) || [];
  return (
    <div style={{ background:"#1a0f00", border:"1px solid #f97316", borderRadius:10, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:18 }}>🟠</span>
          <div>
            <div style={{ fontSize:10, letterSpacing:2, color:"#f97316", textTransform:"uppercase" }}>Strava Activity</div>
            <div style={{ fontSize:14, fontWeight:700, marginTop:1 }}>{data.name}</div>
          </div>
        </div>
        <a href={data.url} target="_blank" rel="noreferrer"
          style={{ fontSize:11, color:"#f97316", textDecoration:"none", border:"1px solid #f97316", borderRadius:6, padding:"4px 8px" }}>
          View ↗
        </a>
      </div>

      {/* Key stats */}
      <div style={{ display:"flex", gap:8, marginBottom: splits.length ? 12 : 0, flexWrap:"wrap" }}>
        {[
          { label:"Distance",  val: formatDist(data.distance) },
          { label:"Time",      val: formatTime(data.moving_time) },
          { label:"Avg Pace",  val: formatPace(data.average_speed) },
          data.average_heartrate && { label:"Avg HR",   val: `${Math.round(data.average_heartrate)} bpm` },
          data.max_heartrate    && { label:"Max HR",   val: `${Math.round(data.max_heartrate)} bpm` },
          { label:"Elevation", val: `${Math.round(data.total_elevation_gain)}m` },
        ].filter(Boolean).map((s,i) => (
          <div key={i} style={{ background:"#111", borderRadius:8, padding:"8px 12px", minWidth:80, flex:1, textAlign:"center" }}>
            <div style={{ fontSize:9, color:"#555", letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#f0ece4" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Splits */}
      {splits.length > 0 && (
        <div>
          <div style={{ fontSize:9, letterSpacing:2, color:"#555", textTransform:"uppercase", marginBottom:6 }}>Splits</div>
          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
            {splits.map((sp, i) => {
              const pace = formatPace(sp.average_speed);
              return (
                <div key={i} style={{ background:"#111", borderRadius:6, padding:"5px 8px", textAlign:"center", minWidth:50 }}>
                  <div style={{ fontSize:9, color:"#555" }}>km {i+1}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#f97316", marginTop:2 }}>{pace.split(" ")[0]}</div>
                </div>
              );
            })}
          </div>
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
  primaryBtn: (c, dis) => ({ width:"100%", background:dis?"#1a1a1a":c, color:dis?"#333":"white", border:"none", borderRadius:12, padding:"17px", fontSize:15, fontWeight:700, cursor:dis?"not-allowed":"pointer", letterSpacing:1, display:"block" }),
  ghostBtn:   { width:"100%", background:"#161616", border:"1px solid #1e1e1e", borderRadius:12, padding:"15px", color:"#666", fontSize:14, cursor:"pointer", marginTop:8, fontFamily:"Georgia,serif", display:"block" },
  signOutBtn: { background:"none", border:"1px solid #2a2a2a", borderRadius:8, padding:"5px 12px", color:"#555", fontSize:11, cursor:"pointer", letterSpacing:1 },
};
