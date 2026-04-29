// Requires: npm install xlsx
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { C, S } from './styles.js';
import { newId, snapToMonday } from './lib/helpers.js';
import { DAY_LABELS } from './lib/constants.js';

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

          {weeks.map(week => (
            <div key={week.id} style={{ ...cardStyle, borderLeft: `3px solid ${C.crimson}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, color: C.navy, fontFamily: S.displayFont, fontSize: 16 }}>{week.weekLabel || 'Untitled week'}</div>
                  <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{week.weekStart}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
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
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="Pace (e.g. 5:00/km)"
                        value={session.pace}
                        onChange={e => handleSessionChange(week.id, session.id, 'pace', e.target.value)}
                      />
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        placeholder="Terrain"
                        value={session.terrain}
                        onChange={e => handleSessionChange(week.id, session.id, 'terrain', e.target.value)}
                      />
                    </div>
                    <textarea
                      style={{ ...S.textarea, minHeight: 64, marginBottom: 8 }}
                      placeholder="Session description…"
                      value={session.desc}
                      onChange={e => handleSessionChange(week.id, session.id, 'desc', e.target.value)}
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
