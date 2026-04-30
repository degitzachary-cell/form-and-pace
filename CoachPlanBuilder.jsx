// Requires: npm install xlsx
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { C, S } from './styles.js';
import { newId, snapToMonday } from './lib/helpers.js';
import { DAY_LABELS } from './lib/constants.js';
import { formatStep } from './lib/load.js';
import { PaceRangeInput, PaceInput } from './components.jsx';

// ─── EXCEL PARSER ────────────────────────────────────────────
function inferSessionType(desc) {
  if (!desc) return 'REST';
  const d = desc.toString();

  if (/SABBATH|REST\b|rest day/i.test(d)) return 'REST';
  if (/Easy w\//i.test(d)) return 'RECOVERY';
  if (/\bRecovery Run\b|Total[^,\n]*Recovery/i.test(d)) return 'RECOVERY';

  const hasWarmup = /\bWU\b|Warm.?Up/i.test(d);
  const hasIntervals = /\d+\s*[×x]\s*\d+|\d+m\s*@|800m|400m|200m|\d+km\s*@|\d+\s*min\s*@/i.test(d);
  const hasTempoKw = /\bMP\b|\bHMP\b|marathon pace/i.test(d);

  if (hasWarmup && hasTempoKw) return 'TEMPO';
  if (hasWarmup && hasIntervals) return 'SPEED';
  if (hasWarmup) return 'SPEED';

  if (/Strides/i.test(d)) return 'EASY';

  if (/\bLong\b/i.test(d)) return 'LONG RUN';
  const minMatch = d.match(/(\d+)\s*min\s*Easy/i);
  if (minMatch && parseInt(minMatch[1]) >= 70) return 'LONG RUN';

  if (/Easy/i.test(d)) return 'EASY';
  return 'EASY';
}

const getTagFromType = (type) => {
  if (type === 'SPEED') return 'speed';
  if (type === 'TEMPO') return 'tempo';
  return 'easy';
};

// Accepts: Date object, ISO YYYY-MM-DD, "10-apr"/"10 apr"/"10/apr",
// "apr 10"/"april 10", "10/04"/"04/10"/"10-04" (DD/MM by default; auto-swaps
// when one part > 12), and "10/04/2026" / "10-04-26". Returns Date or null.
function parseFlexibleDate(input, fallbackYear) {
  if (input == null || input === '') return null;
  if (input instanceof Date) return isNaN(input) ? null : input;
  const raw = String(input).trim();
  if (!raw) return null;
  const s = raw.toLowerCase();

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const yr = (twoOrFour) => twoOrFour ? (twoOrFour.length === 2 ? 2000 + +twoOrFour : +twoOrFour) : (fallbackYear || new Date().getFullYear());

  m = s.match(/^(\d{1,2})[\s\-\/]+([a-z]{3,9})(?:[\s\-\/]+(\d{2,4}))?$/);
  if (m && months[m[2]] !== undefined) return new Date(yr(m[3]), months[m[2]], +m[1]);

  m = s.match(/^([a-z]{3,9})[\s\-\/]+(\d{1,2})(?:[\s\-\/,]+(\d{2,4}))?$/);
  if (m && months[m[1]] !== undefined) return new Date(yr(m[3]), months[m[1]], +m[2]);

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (m) {
    const a = +m[1], b = +m[2], y = yr(m[3]);
    if (a > 12 && b <= 12) return new Date(y, b - 1, a);
    if (b > 12 && a <= 12) return new Date(y, a - 1, b);
    return new Date(y, b - 1, a);
  }

  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

const ymdStr = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

function parseExcelToWeeks(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const weeks = [];

        wb.SheetNames.forEach((sheetName) => {
          const ws = wb.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
          if (!rows || rows.length < 4) return;

          const dateRow    = rows[2];
          const runRow     = rows[3];
          const terrainRow = rows[4];
          const paceRow    = rows[6];
          const kmRow      = rows[7];

          let weekStart = '';
          const mondayParsed = parseFlexibleDate(dateRow ? dateRow[1] : null);
          if (mondayParsed) weekStart = ymdStr(mondayParsed);
          if (!weekStart) {
            const sheetParsed = parseFlexibleDate(sheetName);
            if (sheetParsed) weekStart = ymdStr(sheetParsed);
          }

          const kmLabel = kmRow ? (kmRow[1] || '') : '';
          const weekLabel = sheetName + (kmLabel ? ` · ${kmLabel}` : '');

          const sessions = [];
          const days = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

          days.forEach((day, i) => {
            const colIdx = i + 1;
            const rawDesc = runRow ? (runRow[colIdx] || '') : '';
            const desc = rawDesc instanceof Date ? '' : rawDesc;
            const terrain = terrainRow ? (terrainRow[colIdx] || '') : '';
            const pace = paceRow ? (paceRow[colIdx] || '') : '';
            const dateVal = dateRow ? dateRow[colIdx] : null;
            if (!desc) return;

            let dayStr = day.charAt(0) + day.slice(1,3).toLowerCase();
            if (dateVal) {
              const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
              if (!isNaN(d)) dayStr += ' ' + d.getDate();
            }

            const type = inferSessionType(desc);
            if (type === 'REST') return;
            const tag = getTagFromType(type);

            sessions.push({
              id: newId(),
              day: dayStr,
              type,
              tag,
              desc: desc.toString().trim(),
              pace: pace ? pace.toString().trim() : '',
              terrain: terrain ? terrain.toString().trim() : '',
            });
          });

          if (sessions.length > 0) weeks.push({ weekLabel, weekStart, sessions });
        });

        resolve(weeks);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

const SESSION_TYPES = ['LONG RUN','SPEED','TEMPO','EASY','RECOVERY'];

const TYPE_ACCENT = {
  'LONG RUN': '#14365f',
  'SPEED':    '#7a1a1a',
  'TEMPO':    '#5a2a6e',
  'EASY':     '#2a6e27',
  'RECOVERY': '#0f6678',
};

const cardStyle = {
  background: C.white,
  border: `1px solid ${C.rule}`,
  borderRadius: 2,
  padding: '14px 16px',
  marginBottom: 12,
};

const inputStyle = { ...S.input, padding: '8px 10px', fontSize: 13 };

// Auto-dismissing inline status (replaces alert() calls).
function StatusBanner({ status, onDismiss }) {
  useEffect(() => {
    if (!status || status.kind === 'error') return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [status, onDismiss]);
  if (!status) return null;
  const tone = status.kind === 'error'
    ? { bg: '#fdf0f0', border: C.crimson, color: C.crimson }
    : { bg: '#eef6ec', border: C.green,   color: C.green   };
  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`, borderLeft: `3px solid ${tone.border}`,
      borderRadius: 2, padding: '10px 14px', marginBottom: 14,
      color: tone.color, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <span>{status.message}</span>
      <button onClick={onDismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: tone.color, fontSize: 16, cursor: 'pointer', padding: 0 }}>✕</button>
    </div>
  );
}

// Per-type color for the score grid — terracotta for endurance, hot for
// VO2, cool for recovery, plum for long, amber for tempo, mute for rest.
// Matches the COMPLY/typeStyle palette used elsewhere.
const SCORE_TYPE_COLOR = {
  EASY:        "rgba(181, 72, 42, 0.5)",   // half-opacity terracotta
  RECOVERY:    C.cool,
  "LONG RUN":  "#7B5A8C",
  LONG:        "#7B5A8C",
  TEMPO:       "#D97706",                   // bright orange
  SPEED:       "#C8341B",                   // deep red
  RACE:        C.ink,
  "RACE DAY":  C.ink,
  REST:        C.mute,
  STRENGTH:    "#5A6B7B",
  HYROX:       "#C79541",
};
const scoreTypeColor = (t) => SCORE_TYPE_COLOR[String(t || "").toUpperCase()] || C.accent;

// Read-only "score" view of the athlete's plan — each week as a horizontal
// row with seven day cells (Mon-Sun) showing the type dot + total km. Lets
// the coach see the rhythm of the plan at a glance before drilling into the
// editor below. Renders nothing if no weeks exist yet.
function PlanScoreGrid({ weeks, blockLabel }) {
  if (!Array.isArray(weeks) || weeks.length === 0) return null;
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 8px", borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: C.mute }}>The score</span>
        {blockLabel && <span style={{ fontFamily: S.monoFont || "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.1em", color: C.mute, textTransform: "uppercase" }}>{blockLabel}</span>}
      </div>
      {/* Header row — day initials */}
      <div style={{ display: "grid", gridTemplateColumns: "100px 80px repeat(7, 1fr)", padding: "10px 0", borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.mute }}>Week</span>
        <span style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: C.mute, textAlign: "right", paddingRight: 8 }}>Km</span>
        {days.map(d => (
          <span key={d} style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: C.mute, textAlign: "center" }}>{d}</span>
        ))}
      </div>
      {weeks.map((w, i) => {
        const sessions = Array.isArray(w.sessions) ? w.sessions : [];
        const totalKm = sessions.reduce((acc, s) => {
          const km = parseFloat(s.distance_km || s.distance || 0);
          return acc + (isNaN(km) ? 0 : km);
        }, 0);
        // Pick a phase label heuristically: largest km week in a run of >=3 == BUILD,
        // others fall back to the week's existing weekLabel hint.
        const phase = (() => {
          const lbl = (w.weekLabel || "").toUpperCase();
          if (lbl.includes("RECOVER")) return "RECOVER";
          if (lbl.includes("TAPER"))   return "TAPER";
          if (lbl.includes("PEAK"))    return "PEAK";
          return "BUILD";
        })();
        const phaseColor = phase === "RECOVER" ? C.cool : phase === "TAPER" ? C.cool : phase === "PEAK" ? C.hot : C.accent;
        return (
          <div key={w.id || i} style={{ display: "grid", gridTemplateColumns: "100px 80px repeat(7, 1fr)", padding: "12px 0", borderBottom: `1px solid ${C.ruleSoft}`, alignItems: "stretch" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: S.displayFont, fontSize: 18, lineHeight: 1, color: C.ink }}>
                {w.weekLabel || `WK ${String(i + 1).padStart(2, "0")}`}
              </div>
              <div style={{ marginTop: 4, display: "inline-flex", padding: "2px 7px", border: `1px solid ${phaseColor}`, color: phaseColor, fontSize: 9, letterSpacing: "0.14em", fontWeight: 600 }}>
                {phase}
              </div>
            </div>
            <div style={{ textAlign: "right", paddingRight: 8 }}>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 16, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(totalKm)}
              </span>
            </div>
            {days.map(dayInitial => {
              // Find sessions whose day starts with this initial (Mon, Tue, ...).
              const dayKey = dayInitial.charAt(0) + dayInitial.slice(1).toLowerCase();
              const found = sessions.find(s => (s.day || "").slice(0, 3) === dayKey);
              if (!found || (found.type || "").toUpperCase() === "REST") {
                return (
                  <div key={dayInitial} style={{ borderLeft: `1px solid ${C.ruleSoft}`, padding: "4px 6px", minHeight: 48, color: C.mute, fontSize: 11, fontStyle: "italic", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {found ? "rest" : ""}
                  </div>
                );
              }
              const dot = scoreTypeColor(found.type);
              const km = parseFloat(found.distance_km || found.distance || 0);
              return (
                <div key={dayInitial} style={{ borderLeft: `1px solid ${C.ruleSoft}`, padding: "4px 6px", minHeight: 48 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: dot, display: "inline-block" }}/>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.mute }}>
                      {String(found.type || "").slice(0, 6)}
                    </span>
                  </div>
                  {km > 0 && (
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
                      {km}
                      <span style={{ color: C.mute, fontSize: 9 }}>km</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Inline structured-step editor. Lives next to the freeform desc on each
// session card. Coaches can mix-and-match — type a desc, build steps, or
// both. When steps are present the athlete view will render them as a
// checkable list.
export function StepsEditor({ session, onChange }) {
  const steps = Array.isArray(session?.steps) ? session.steps : [];
  const setStep = (i, patch) => {
    const next = steps.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange(next);
  };
  const setNested = (i, group, patch) => {
    const next = steps.map((s, idx) => idx === i ? { ...s, [group]: { ...(s[group] || {}), ...patch } } : s);
    onChange(next);
  };
  const remove = (i) => onChange(steps.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (kind) => {
    const blank = (() => {
      switch (kind) {
        case 'warmup':   return { kind: 'warmup',   duration_min: 15, pace: '' };
        case 'cooldown': return { kind: 'cooldown', duration_min: 10, pace: '' };
        case 'steady':   return { kind: 'steady',   unit: 'km',  duration_min: '', distance_km: 5, pace: '', note: '' };
        case 'recovery': return { kind: 'recovery', unit: 'min', duration_min: 5, distance_km: '', pace: '' };
        case 'strides':  return { kind: 'strides',  reps: 6, stride_s: 20, rest_s: 40 };
        case 'interval': return { kind: 'interval', reps: 6,
                                  work:     { unit: 'm',   distance_m: 800, duration_s: '', pace: '' },
                                  recovery: { unit: 'sec', distance_m: '',  duration_s: 90, pace: '' } };
        default: return null;
      }
    })();
    if (blank) onChange([...steps, blank]);
  };

  const inp = { background: C.paper, border: `1px solid ${C.rule}`, borderRadius: 2, padding: '5px 8px', fontSize: 12, fontFamily: S.bodyFont, color: C.ink, fontVariantNumeric: 'tabular-nums' };
  const lbl = { fontSize: 9, letterSpacing: 1.5, color: C.mid, textTransform: 'uppercase', marginRight: 6 };
  const stepBox = { background: C.paper, border: `1px solid ${C.rule}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 2, padding: '10px 12px', marginBottom: 8 };

  // UI label per kind. Steady stays as "Workout" in the spec — the underlying
  // kind name is preserved for back-compat with sessions stored before this
  // refactor.
  const kindLabel = (kind) => ({
    warmup:   'Warm Up',
    cooldown: 'Cool Down',
    steady:   'Workout',
    recovery: 'Recovery',
    interval: 'Interval',
    strides:  'Strides',
  }[kind] || kind);

  // Recovery style picker — jog (slow easy) or float (moderate, faster
  // than jog but slower than work). Stored on the relevant block's
  // .style field so it travels alongside duration + pace.
  const StyleToggle = ({ value, onChange }) => (
    <div style={{ display: 'inline-flex', borderRadius: 2, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
      {[{ v: 'jog', label: 'Jog' }, { v: 'float', label: 'Float' }].map((opt, idx) => {
        const active = (value || 'jog') === opt.v;
        return (
          <button key={opt.v} type="button" onClick={() => onChange(opt.v)}
            style={{
              background: active ? C.ink : 'transparent', color: active ? C.paper : C.mute,
              border: 0, padding: '4px 10px',
              fontFamily: S.bodyFont, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', borderLeft: idx === 0 ? 'none' : `1px solid ${C.rule}`,
            }}>{opt.label}</button>
        );
      })}
    </div>
  );

  // Distance/Time mode picker — small two-button toggle that flips the field
  // shown for a section. Stores the preferred unit on `step.unit`.
  const UnitToggle = ({ step, i, options }) => (
    <div style={{ display: 'inline-flex', borderRadius: 2, border: `1px solid ${C.rule}`, overflow: 'hidden', marginRight: 6 }}>
      {options.map((opt, idx) => {
        const active = (step.unit || options[0].value) === opt.value;
        return (
          <button key={opt.value} type="button"
            onClick={() => setStep(i, { unit: opt.value })}
            style={{
              background: active ? C.ink : 'transparent', color: active ? C.paper : C.mute,
              border: 0, padding: '4px 10px',
              fontFamily: S.bodyFont, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', borderLeft: idx === 0 ? 'none' : `1px solid ${C.rule}`,
            }}>{opt.label}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, letterSpacing: 2, color: C.mid, textTransform: 'uppercase', marginBottom: 8 }}>Sections (optional)</div>
      {steps.map((step, i) => (
        <div key={i} style={stepBox}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, letterSpacing: 1.5, color: C.accent, fontWeight: 700, textTransform: 'uppercase' }}>{kindLabel(step.kind)}</span>
            <span style={{ fontSize: 12, color: C.mute, fontStyle: 'italic', flex: 1, fontFamily: S.displayFont }}>{formatStep(step)}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} style={{ background: 'transparent', border: 'none', color: i === 0 ? C.rule : C.mute, cursor: i === 0 ? 'default' : 'pointer', fontSize: 14 }}>↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === steps.length - 1} style={{ background: 'transparent', border: 'none', color: i === steps.length - 1 ? C.rule : C.mute, cursor: i === steps.length - 1 ? 'default' : 'pointer', fontSize: 14 }}>↓</button>
            <button type="button" onClick={() => remove(i)} style={{ background: 'transparent', border: 'none', color: C.hot, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
          </div>

          {(step.kind === 'warmup' || step.kind === 'cooldown') && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <UnitToggle step={step} i={i} options={[{ value: 'min', label: 'Time' }, { value: 'km', label: 'Distance' }]}/>
              {(step.unit || 'min') === 'min' ? (
                <>
                  <input style={{ ...inp, width: 60 }} type="number" value={step.duration_min ?? ''} placeholder="min" onChange={e => setStep(i, { duration_min: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={lbl}>min</span>
                </>
              ) : (
                <>
                  <input style={{ ...inp, width: 60 }} type="number" step="0.1" value={step.distance_km ?? ''} placeholder="km" onChange={e => setStep(i, { distance_km: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={lbl}>km</span>
                </>
              )}
              <PaceRangeInput value={step.pace || ''} onChange={(v) => setStep(i, { pace: v })} label="Pace"/>
            </div>
          )}

          {step.kind === 'steady' && (
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <UnitToggle step={step} i={i} options={[{ value: 'km', label: 'Distance' }, { value: 'min', label: 'Time' }]}/>
                {(step.unit || 'km') === 'km' ? (
                  <>
                    <input style={{ ...inp, width: 60 }} type="number" step="0.1" value={step.distance_km ?? ''} placeholder="km" onChange={e => setStep(i, { distance_km: e.target.value === '' ? '' : Number(e.target.value) })}/>
                    <span style={lbl}>km</span>
                  </>
                ) : (
                  <>
                    <input style={{ ...inp, width: 60 }} type="number" value={step.duration_min ?? ''} placeholder="min" onChange={e => setStep(i, { duration_min: e.target.value === '' ? '' : Number(e.target.value) })}/>
                    <span style={lbl}>min</span>
                  </>
                )}
                <PaceRangeInput value={step.pace || ''} onChange={(v) => setStep(i, { pace: v })} label="Pace"/>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={lbl}>reps</span>
                <input style={{ ...inp, width: 50 }} type="number" min="1" value={step.reps ?? 1} onChange={e => setStep(i, { reps: Math.max(1, Number(e.target.value) || 1) })}/>
                {(Number(step.reps) || 1) > 1 && (
                  <>
                    <span style={lbl}>rest</span>
                    <input style={{ ...inp, width: 60 }} type="number" placeholder="sec" value={step.rest?.duration_s ?? ''} onChange={e => setNested(i, 'rest', { duration_s: e.target.value === '' ? '' : Number(e.target.value) })}/>
                    <span style={lbl}>sec</span>
                    <span style={{ fontSize:10, color:C.mid }}>or</span>
                    <input style={{ ...inp, width: 50 }} type="number" placeholder="min" value={step.rest?.duration_min ?? ''} onChange={e => setNested(i, 'rest', { duration_min: e.target.value === '' ? '' : Number(e.target.value) })}/>
                    <span style={lbl}>min</span>
                    {/* Rest type: standing rest, jog, or float */}
                    <div style={{ display: 'inline-flex', borderRadius: 2, border: `1px solid ${C.rule}`, overflow: 'hidden' }}>
                      {[{ v: 'rest', label: 'Rest' }, { v: 'jog', label: 'Jog' }, { v: 'float', label: 'Float' }].map((opt, idx) => {
                        const active = (step.rest?.style || 'rest') === opt.v;
                        return (
                          <button key={opt.v} type="button" onClick={() => setNested(i, 'rest', { style: opt.v })}
                            style={{
                              background: active ? C.ink : 'transparent', color: active ? C.paper : C.mute,
                              border: 0, padding: '4px 10px',
                              fontFamily: S.bodyFont, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                              cursor: 'pointer', borderLeft: idx === 0 ? 'none' : `1px solid ${C.rule}`,
                            }}>{opt.label}</button>
                        );
                      })}
                    </div>
                  </>
                )}
                <input style={{ ...inp, width: 160, marginLeft:'auto' }} placeholder="note (e.g. at MP)" value={step.note || ''} onChange={e => setStep(i, { note: e.target.value })}/>
              </div>
            </div>
          )}

          {step.kind === 'recovery' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <UnitToggle step={step} i={i} options={[{ value: 'min', label: 'Time' }, { value: 'km', label: 'Distance' }]}/>
              {(step.unit || 'min') === 'min' ? (
                <>
                  <input style={{ ...inp, width: 60 }} type="number" value={step.duration_min ?? ''} placeholder="min" onChange={e => setStep(i, { duration_min: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={lbl}>min</span>
                </>
              ) : (
                <>
                  <input style={{ ...inp, width: 60 }} type="number" step="0.1" value={step.distance_km ?? ''} placeholder="km" onChange={e => setStep(i, { distance_km: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={lbl}>km</span>
                </>
              )}
              <StyleToggle value={step.style} onChange={(v) => setStep(i, { style: v })}/>
              <PaceRangeInput value={step.pace || ''} onChange={(v) => setStep(i, { pace: v })} label="Pace"/>
            </div>
          )}

          {step.kind === 'strides' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={lbl}>reps</span>
              <input style={{ ...inp, width: 50 }} type="number" min="1" value={step.reps ?? 6} onChange={e => setStep(i, { reps: Math.max(1, Number(e.target.value) || 1) })}/>
              <span style={lbl}>stride</span>
              <input style={{ ...inp, width: 60 }} type="number" min="1" value={step.stride_s ?? 20} onChange={e => setStep(i, { stride_s: e.target.value === '' ? '' : Number(e.target.value) })}/>
              <span style={lbl}>sec</span>
              <span style={lbl}>rest</span>
              <input style={{ ...inp, width: 60 }} type="number" min="0" value={step.rest_s ?? 40} onChange={e => setStep(i, { rest_s: e.target.value === '' ? '' : Number(e.target.value) })}/>
              <span style={lbl}>sec</span>
            </div>
          )}

          {step.kind === 'interval' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', gridColumn: '1 / -1' }}>
                <span style={lbl}>reps</span>
                <input style={{ ...inp, width: 50 }} type="number" min="1" value={step.reps ?? 1} onChange={e => setStep(i, { reps: Math.max(1, Number(e.target.value) || 1) })}/>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.rule}`, padding: 8, borderRadius: 2 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>Work</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input style={{ ...inp, width: 70 }} type="number" placeholder="m" value={step.work?.distance_m ?? ''} onChange={e => setNested(i, 'work', { distance_m: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={{ fontSize: 10, color: C.mid }}>or</span>
                  <input style={{ ...inp, width: 60 }} type="number" placeholder="sec" value={step.work?.duration_s ?? ''} onChange={e => setNested(i, 'work', { duration_s: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <PaceRangeInput value={step.work?.pace || ''} onChange={(v) => setNested(i, 'work', { pace: v })}/>
                </div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.rule}`, padding: 8, borderRadius: 2 }}>
                <div style={{ ...lbl, marginBottom: 6 }}>Recovery</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input style={{ ...inp, width: 70 }} type="number" placeholder="m" value={step.recovery?.distance_m ?? ''} onChange={e => setNested(i, 'recovery', { distance_m: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <span style={{ fontSize: 10, color: C.mid }}>or</span>
                  <input style={{ ...inp, width: 60 }} type="number" placeholder="sec" value={step.recovery?.duration_s ?? ''} onChange={e => setNested(i, 'recovery', { duration_s: e.target.value === '' ? '' : Number(e.target.value) })}/>
                  <StyleToggle value={step.recovery?.style} onChange={(v) => setNested(i, 'recovery', { style: v })}/>
                  <PaceRangeInput value={step.recovery?.pace || ''} onChange={(v) => setNested(i, 'recovery', { pace: v })}/>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { k: 'warmup',   label: '+ Warm Up'  },
          { k: 'steady',   label: '+ Workout'  },
          { k: 'recovery', label: '+ Recovery' },
          { k: 'interval', label: '+ Interval' },
          { k: 'strides',  label: '+ Strides'  },
          { k: 'cooldown', label: '+ Cool Down' },
        ].map(({ k, label }) => (
          <button key={k} type="button" onClick={() => add(k)} style={{
            background: 'transparent', color: C.accent, border: `1px solid ${C.rule}`,
            borderRadius: 2, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.5,
          }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

export default function CoachPlanBuilder({ athletes, onSave }) {
  const [selectedEmail, setSelectedEmail] = useState('');
  const [weeks, setWeeks] = useState([]);
  const [athleteName, setAthleteName] = useState('');
  const [athleteGoal, setAthleteGoal] = useState('');
  const [athletePb,   setAthletePb]   = useState('');
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newWeekStart, setNewWeekStart] = useState('');
  const [showAddWeek, setShowAddWeek] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('');
  const [uploadMode, setUploadMode] = useState('append');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);   // { kind: 'success' | 'error', message }
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState('');
  const fileInputRef = useRef(null);

  // Cross-athlete copy/paste — survives switching the selected athlete.
  // Persisted in localStorage so it also survives a tab refresh: the coach
  // can copy on Monday morning and paste later in the day. Stores the week's
  // sessions stripped of IDs (regenerated on paste).
  const [clipboardWeek, setClipboardWeek] = useState(() => {
    try {
      const raw = localStorage.getItem('fp.planBuilder.clipboardWeek');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const writeClipboard = (week) => {
    setClipboardWeek(week);
    try {
      if (week) localStorage.setItem('fp.planBuilder.clipboardWeek', JSON.stringify(week));
      else      localStorage.removeItem('fp.planBuilder.clipboardWeek');
    } catch { /* quota / private mode — ignore */ }
  };

  // Dirty = current state differs from last loaded/saved snapshot.
  const currentSnapshot = JSON.stringify({ weeks, athleteName, athleteGoal, athletePb });
  const isDirty = !!selectedEmail && baseline !== '' && currentSnapshot !== baseline;

  // Warn before leaving the tab with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const athleteList = Object.entries(athletes || {}).map(([email, data]) => ({
    email,
    name: data?.name || email.split('@')[0],
  }));

  useEffect(() => {
    const entry = selectedEmail ? athletes[selectedEmail] : null;
    const w = entry?.weeks || [];
    const n = entry?.name && entry.name !== selectedEmail ? entry.name : '';
    const g = entry?.goal && entry.goal !== '—' ? entry.goal : '';
    const p = entry?.current && entry.current !== '—' ? entry.current : '';
    setWeeks(w);
    setAthleteName(n);
    setAthleteGoal(g);
    setAthletePb(p);
    setBaseline(JSON.stringify({ weeks: w, athleteName: n, athleteGoal: g, athletePb: p }));
  }, [selectedEmail, athletes]);

  const buildMeta = () => ({
    name:    athleteName,
    goal:    athleteGoal,
    current: athletePb,
  });

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget) return;
    setUploading(true);
    try {
      const parsedWeeks = await parseExcelToWeeks(file);
      const existing = athletes[uploadTarget]?.weeks || [];
      const updated = uploadMode === 'replace' ? parsedWeeks : [...existing, ...parsedWeeks];
      const targetData = athletes[uploadTarget] || {};
      const importMeta = {
        name:    targetData.name    && targetData.name    !== uploadTarget ? targetData.name    : '',
        goal:    targetData.goal    && targetData.goal    !== '—'         ? targetData.goal    : '',
        current: targetData.current && targetData.current !== '—'         ? targetData.current : '',
      };
      await Promise.resolve(onSave(uploadTarget, updated, importMeta));
      setSelectedEmail(uploadTarget);
      setStatus({ kind: 'success', message: `Imported ${parsedWeeks.length} week${parsedWeeks.length === 1 ? '' : 's'} for ${athletes[uploadTarget]?.name || uploadTarget}.` });
    } catch (err) {
      setStatus({ kind: 'error', message: `Failed to parse Excel: ${err.message}` });
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleAddWeek = () => {
    if (!newWeekLabel || !newWeekStart) return;
    // Always snap to Monday so weeks line up with sessionDateStr lookups.
    const monday = snapToMonday(newWeekStart) || newWeekStart;
    const newWeek = { id: newId(), weekLabel: newWeekLabel, weekStart: monday, sessions: [] };
    setWeeks([...weeks, newWeek]);
    setNewWeekLabel('');
    setNewWeekStart('');
    setShowAddWeek(false);
  };

  const handleDuplicateWeek = (weekId) => {
    const src = weeks.find(w => w.id === weekId);
    if (!src) return;
    // Default the new weekStart to the Monday after the source week.
    const next = new Date((src.weekStart || todayMondayFallback()) + 'T00:00:00');
    next.setDate(next.getDate() + 7);
    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, '0');
    const dy = String(next.getDate()).padStart(2, '0');
    const newWeek = {
      id: newId(),
      weekLabel: `${src.weekLabel || 'Week'} (copy)`,
      weekStart: `${y}-${m}-${dy}`,
      sessions: src.sessions.map(s => ({ ...s, id: newId() })),
    };
    const idx = weeks.findIndex(w => w.id === weekId);
    setWeeks([...weeks.slice(0, idx + 1), newWeek, ...weeks.slice(idx + 1)]);
  };

  const todayMondayFallback = () => {
    const t = new Date();
    return snapToMonday(t.toISOString().slice(0, 10));
  };

  // Copy a week to the cross-athlete clipboard. Strips IDs and dates — the
  // skeleton (label, sessions with their day/type/pace/desc) is what travels.
  const handleCopyWeek = (weekId) => {
    const src = weeks.find(w => w.id === weekId);
    if (!src) return;
    writeClipboard({
      weekLabel: src.weekLabel || 'Copied week',
      sessions: src.sessions.map(({ id, ...rest }) => ({ ...rest })),
      _copiedFrom: athleteName || selectedEmail || '',
      _copiedAt: new Date().toISOString(),
    });
    setStatus({ kind: 'success', message: 'Week copied — paste into any athlete.' });
  };

  // Paste the clipboard into the currently selected athlete. Picks the
  // Monday after the latest existing week as the weekStart (or this Monday
  // if the athlete has no weeks yet). New IDs are minted for each session.
  const handlePasteWeek = () => {
    if (!clipboardWeek || !selectedEmail) return;
    let weekStart;
    if (weeks.length > 0) {
      const latest = [...weeks]
        .map(w => w.weekStart)
        .filter(Boolean)
        .sort()
        .pop();
      if (latest) {
        const next = new Date(latest + 'T00:00:00');
        next.setDate(next.getDate() + 7);
        const y = next.getFullYear();
        const m = String(next.getMonth() + 1).padStart(2, '0');
        const dy = String(next.getDate()).padStart(2, '0');
        weekStart = `${y}-${m}-${dy}`;
      }
    }
    if (!weekStart) weekStart = todayMondayFallback();
    const newWeek = {
      id: newId(),
      weekLabel: clipboardWeek.weekLabel || 'Pasted week',
      weekStart,
      sessions: (clipboardWeek.sessions || []).map(s => ({ ...s, id: newId() })),
    };
    setWeeks([...weeks, newWeek]);
    setStatus({ kind: 'success', message: `Pasted week (${newWeek.sessions.length} sessions) into ${athleteName || selectedEmail}.` });
  };

  const handleDeleteWeek = (weekId) => {
    setWeeks(weeks.filter(w => w.id !== weekId));
  };

  const handleAddSession = (weekId) => {
    const newSession = { id: newId(), day: '', type: 'EASY', tag: 'easy', pace: '', terrain: '', desc: '' };
    setWeeks(weeks.map(w => w.id === weekId ? { ...w, sessions: [...w.sessions, newSession] } : w));
  };

  const handleSessionChange = (weekId, sessionId, field, value) => {
    setWeeks(weeks.map(w => {
      if (w.id !== weekId) return w;
      const sessions = w.sessions.map(s => {
        if (s.id !== sessionId) return s;
        const updates = { [field]: value };
        if (field === 'type') updates.tag = getTagFromType(value);
        return { ...s, ...updates };
      });
      return { ...w, sessions };
    }));
  };

  const handleDeleteSession = (weekId, sessionId) => {
    setWeeks(weeks.map(w => w.id === weekId ? { ...w, sessions: w.sessions.filter(s => s.id !== sessionId) } : w));
  };

  const handleSave = async () => {
    if (!selectedEmail) return;
    setSaving(true);
    try {
      await Promise.resolve(onSave(selectedEmail, weeks, buildMeta()));
      const displayName = athleteName || athletes[selectedEmail]?.name || selectedEmail;
      setStatus({ kind: 'success', message: `Plan saved for ${displayName}.` });
      setBaseline(JSON.stringify({ weeks, athleteName, athleteGoal, athletePb }));
    } catch (err) {
      setStatus({ kind: 'error', message: `Save failed: ${err.message}` });
    }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 80px', fontFamily: S.bodyFont, color: C.navy }}>
      <StatusBanner status={status} onDismiss={() => setStatus(null)} />

      {/* ── Excel Upload ── */}
      <div style={cardStyle}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: C.crimson, textTransform: 'uppercase', marginBottom: 10 }}>Import from Excel</div>
        <select style={{ ...inputStyle, marginBottom: 10 }} value={uploadTarget} onChange={e => setUploadTarget(e.target.value)}>
          <option value="">Select athlete to import into…</option>
          {athleteList.map(a => <option key={a.email} value={a.email}>{a.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['append', 'replace'].map(mode => (
            <button key={mode} type="button" onClick={() => setUploadMode(mode)}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 2, fontSize: 12, cursor: 'pointer',
                background: uploadMode === mode ? C.navy   : C.white,
                color:      uploadMode === mode ? C.cream  : C.mid,
                border: `1px solid ${uploadMode === mode ? C.navy : C.rule}`,
                letterSpacing: 0.5, fontWeight: 600,
              }}>
              {mode === 'append' ? '+ Append weeks' : '↻ Replace all'}
            </button>
          ))}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleExcelUpload} />
        <button type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!uploadTarget || uploading}
          style={S.primaryBtn(C.navy, !uploadTarget || uploading)}>
          {uploading ? 'Importing…' : 'Choose Excel file (.xlsx)'}
        </button>
      </div>

      {/* ── Athlete picker ── */}
      <div style={cardStyle}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: C.mid, textTransform: 'uppercase', marginBottom: 10 }}>Athlete</div>
        <select style={inputStyle} value={selectedEmail} onChange={e => setSelectedEmail(e.target.value)}>
          <option value="">Select an athlete…</option>
          {athleteList.map(a => (
            <option key={a.email} value={a.email}>{a.name} ({a.email})</option>
          ))}
        </select>
      </div>

      {selectedEmail ? (
        <>
          {/* ── Athlete metadata (name / goal / PB) ── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C.mid, textTransform: 'uppercase', marginBottom: 10 }}>Athlete details</div>
            <div style={{ fontSize: 11, color: C.mid, marginBottom: 10, lineHeight: 1.5 }}>
              These show on the athlete's card before they sign in. Once they
              log in, their own profile takes over.
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 8 }}
              placeholder="Full name (e.g. Jeremy Blackmore)"
              value={athleteName}
              onChange={e => setAthleteName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Goal (e.g. 1:50 HM)"
                value={athleteGoal}
                onChange={e => setAthleteGoal(e.target.value)}
              />
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Current PB (e.g. 1:55)"
                value={athletePb}
                onChange={e => setAthletePb(e.target.value)}
              />
            </div>
          </div>

          {selectedEmail && weeks.length > 0 && (
            <PlanScoreGrid weeks={weeks} blockLabel={`${weeks.length} ${weeks.length === 1 ? "week" : "weeks"} planned`} />
          )}

          {clipboardWeek && selectedEmail && (
            <div style={{
              ...cardStyle,
              background: C.bgDeep, borderColor: C.accent, borderLeft: `3px solid ${C.accent}`,
              marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            }}>
              <div>
                <div style={{ fontSize: 10, letterSpacing: 2, color: C.accent, textTransform: 'uppercase', fontWeight: 700 }}>Clipboard</div>
                <div style={{ fontFamily: S.displayFont, fontSize: 16, color: C.ink, marginTop: 2 }}>
                  {clipboardWeek.weekLabel || 'Copied week'}
                  <span style={{ fontStyle: 'italic', color: C.mute, fontSize: 13, marginLeft: 8 }}>
                    · {clipboardWeek.sessions?.length || 0} sessions{clipboardWeek._copiedFrom ? ` from ${clipboardWeek._copiedFrom}` : ''}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={handlePasteWeek} style={{
                  background: C.accent, color: C.accentInk, border: 'none', borderRadius: 2,
                  padding: '8px 16px', fontSize: 11, letterSpacing: 1.5, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                }}>Paste here →</button>
                <button type="button" onClick={() => writeClipboard(null)} style={{
                  background: 'transparent', color: C.mute, border: `1px solid ${C.rule}`,
                  borderRadius: 2, padding: '8px 12px', fontSize: 11, cursor: 'pointer',
                }}>Clear</button>
              </div>
            </div>
          )}

          {weeks.map(week => (
            <div key={week.id} style={{ ...cardStyle, borderLeft: `3px solid ${C.crimson}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, color: C.navy, fontFamily: S.displayFont, fontSize: 16 }}>{week.weekLabel || 'Untitled week'}</div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{week.weekStart}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => handleCopyWeek(week.id)} style={{
                    background: C.white, color: C.navy, border: `1px solid ${C.rule}`,
                    borderRadius: 2, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                  }} title="Copy this week to clipboard — paste into any athlete">Copy</button>
                  <button type="button" onClick={() => handleDuplicateWeek(week.id)} style={{
                    background: C.white, color: C.navy, border: `1px solid ${C.rule}`,
                    borderRadius: 2, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                  }}>Duplicate</button>
                  <button type="button" onClick={() => handleDeleteWeek(week.id)} style={{
                    background: C.white, color: C.crimson, border: `1px solid ${C.rule}`,
                    borderRadius: 2, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                  }}>Delete week</button>
                </div>
              </div>

              {week.sessions.map(session => {
                const accent = TYPE_ACCENT[session.type] || C.mid;
                return (
                  <div key={session.id} style={{
                    background: C.white, border: `1px solid ${C.lightRule}`, borderLeft: `3px solid ${accent}`,
                    borderRadius: 2, padding: 12, marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      <select
                        style={{ ...inputStyle, flex: '0 0 90px' }}
                        value={DAY_LABELS.includes(session.day?.slice(0, 3)) ? session.day.slice(0, 3) : ''}
                        onChange={e => handleSessionChange(week.id, session.id, 'day', e.target.value)}
                      >
                        <option value="">Day…</option>
                        {DAY_LABELS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <select
                        style={{ ...inputStyle, flex: '1 1 140px', color: accent, fontWeight: 600 }}
                        value={session.type}
                        onChange={e => handleSessionChange(week.id, session.id, 'type', e.target.value)}
                      >
                        {SESSION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <PaceRangeInput
                        label="Pace"
                        value={session.pace}
                        onChange={(v) => handleSessionChange(week.id, session.id, 'pace', v)}
                      />
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="Terrain"
                        value={session.terrain}
                        onChange={e => handleSessionChange(week.id, session.id, 'terrain', e.target.value)}
                      />
                    </div>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: C.mid, textTransform: 'uppercase', marginBottom: 6 }}>Coach notes</div>
                    <textarea
                      style={{ ...S.textarea, minHeight: 64, marginBottom: 8 }}
                      placeholder="Anything the athlete should know — context, focus, cues."
                      value={session.desc}
                      onChange={e => handleSessionChange(week.id, session.id, 'desc', e.target.value)}
                    />

                    <StepsEditor
                      session={session}
                      onChange={(steps) => handleSessionChange(week.id, session.id, 'steps', steps)}
                    />

                    <button type="button" onClick={() => handleDeleteSession(week.id, session.id)} style={{
                      background: C.white, color: C.crimson, border: `1px solid ${C.rule}`,
                      borderRadius: 2, padding: '5px 10px', fontSize: 11, cursor: 'pointer',
                    }}>Delete session</button>
                  </div>
                );
              })}

              <button type="button" onClick={() => handleAddSession(week.id)} style={{
                ...S.ghostBtn, marginTop: 4,
              }}>+ Add session</button>
            </div>
          ))}

          {showAddWeek ? (
            <div style={cardStyle}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Week label (e.g. Week 1)"
                  value={newWeekLabel}
                  onChange={e => setNewWeekLabel(e.target.value)}
                />
                <input
                  type="date"
                  style={{ ...inputStyle, flex: 1 }}
                  value={newWeekStart}
                  onChange={e => setNewWeekStart(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={{ ...S.primaryBtn(C.navy, !newWeekLabel || !newWeekStart), flex: 1 }}
                  disabled={!newWeekLabel || !newWeekStart} onClick={handleAddWeek}>Add week</button>
                <button type="button" style={{ ...S.ghostBtn, flex: 1, marginTop: 0 }}
                  onClick={() => setShowAddWeek(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddWeek(true)} style={S.ghostBtn}>+ Add week</button>
          )}

          <button type="button" onClick={handleSave} disabled={saving || !isDirty}
            style={{ ...S.primaryBtn(C.crimson, saving || !isDirty), marginTop: 16 }}>
            {saving ? 'Saving…' : isDirty ? '● Save plan (unsaved changes)' : 'Saved'}
          </button>
        </>
      ) : (
        <div style={{ ...cardStyle, textAlign: 'center', color: C.mid, fontSize: 13 }}>
          Select an athlete to view and edit their training plan.
        </div>
      )}
    </div>
  );
}
