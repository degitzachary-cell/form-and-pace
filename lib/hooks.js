import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase.js";
import { normalizePlan } from "./constants.js";
import { getStats } from "./helpers.js";

// Subscribes to realtime Supabase changes for session_logs, activities, and
// coach_plans. Calls the supplied setters on each change so the caller's state
// stays in sync without polling.
export function useRealtimeSync({ user, role, setLogs, setActivities, setAthletePrograms }) {
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
        if (payload.eventType !== "DELETE") applyPlan(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, role]);
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
