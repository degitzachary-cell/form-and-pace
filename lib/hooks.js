import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";
import { normalizePlan } from "./constants.js";
import { getStats } from "./helpers.js";

// Subscribes to realtime Supabase changes for session_logs, activities,
// coach_plans, and calendar_markers. Calls the supplied setters on each
// change so the caller's state stays in sync without polling.
//
// Returns the current channel status — one of:
//   "connecting" | "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED"
// so callers can render a small "offline" indicator when the socket drops.
//
// Important: realtime only delivers events for tables that are members of
// the supabase_realtime publication. See
// supabase-realtime-publication-migration.sql — the hook will subscribe
// successfully even when tables are missing from the publication, but no
// events will ever arrive. If updates feel "stuck", check the publication
// first.
export function useRealtimeSync({ user, role, setLogs, setActivities, setAthletePrograms, setMarkersByEmail }) {
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    if (!user || !role) return;
    const email = user.email?.toLowerCase();

    const applyLog = (row) => {
      if (!row) return;
      if (role === "athlete" && row.athlete_email?.toLowerCase() !== email) return;
      setLogs(prev => ({ ...prev, [row.session_id]: row }));
    };
    const removeLog = (row) => {
      if (!row?.session_id) return;
      setLogs(prev => { const next = { ...prev }; delete next[row.session_id]; return next; });
    };
    const applyAct = (row) => {
      if (!row) return;
      if (role === "athlete" && row.athlete_email?.toLowerCase() !== email) return;
      setActivities(prev => {
        const i = prev.findIndex(a => a.id === row.id);
        if (i === -1) return [row, ...prev];
        const next = prev.slice(); next[i] = row; return next;
      });
    };
    const removeAct = (row) => {
      if (!row?.id) return;
      setActivities(prev => prev.filter(a => a.id !== row.id));
    };
    const applyPlan = (row) => {
      if (!row?.athlete_email) return;
      const key = row.athlete_email.toLowerCase();
      if (role === "athlete" && key !== email) return;
      const { weeks, meta } = normalizePlan(row.plan_json);
      setAthletePrograms(prev => ({
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          ...Object.fromEntries(Object.entries(meta).filter(([,v]) => v)),
          weeks,
        },
      }));
    };
    const applyMarker = (row) => {
      if (!setMarkersByEmail || !row?.athlete_email) return;
      const key = row.athlete_email.toLowerCase();
      if (role === "athlete" && key !== email) return;
      setMarkersByEmail(prev => {
        const list = prev[key] || [];
        const i = list.findIndex(m => m.id === row.id);
        const nextList = i === -1 ? [...list, row] : list.slice();
        if (i !== -1) nextList[i] = row;
        nextList.sort((a, b) => (a.marker_date || "").localeCompare(b.marker_date || ""));
        return { ...prev, [key]: nextList };
      });
    };
    const removeMarker = (row) => {
      if (!setMarkersByEmail || !row?.id) return;
      setMarkersByEmail(prev => {
        const next = {};
        for (const [k, list] of Object.entries(prev)) {
          next[k] = (list || []).filter(m => m.id !== row.id);
        }
        return next;
      });
    };

    const ch = supabase
      .channel("form-pace-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "session_logs" }, payload => {
        if (payload.eventType === "DELETE") removeLog(payload.old);
        else applyLog(payload.new);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities" }, payload => {
        if (payload.eventType === "DELETE") removeAct(payload.old);
        else applyAct(payload.new);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "coach_plans" }, payload => {
        if (payload.eventType === "DELETE") {
          const key = payload.old?.athlete_email?.toLowerCase();
          if (key) setAthletePrograms(prev => { const next = { ...prev }; delete next[key]; return next; });
        } else {
          applyPlan(payload.new);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "calendar_markers" }, payload => {
        if (payload.eventType === "DELETE") removeMarker(payload.old);
        else applyMarker(payload.new);
      })
      .subscribe((s, err) => {
        setStatus(s);
        // SUBSCRIBED is the happy path; anything else is worth seeing in
        // the console while debugging "why didn't the coach get an
        // update". CHANNEL_ERROR usually means the table isn't in the
        // supabase_realtime publication or RLS is blocking SELECTs.
        if (s !== "SUBSCRIBED") {
          // eslint-disable-next-line no-console
          console.log("[realtime]", s, err || "");
        }
      });
    return () => {
      setStatus("CLOSED");
      supabase.removeChannel(ch);
    };
  }, [user, role]);

  return status;
}

// Returns the current inner width and updates on resize.
export function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

// Returns activitiesByEmail (Map) and statsFor(email) function,
// both memoised so athlete cards don't recompute on every render.
export function useAthleteStats({ activities, athletePrograms, logs }) {
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

  const statsFor = (email) =>
    statsCache.get(email) || { total: 0, done: 0, missed: 0, partial: 0, rate: 0 };

  return { activitiesByEmail, statsFor };
}
