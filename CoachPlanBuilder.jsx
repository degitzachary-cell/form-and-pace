// Requires: npm install xlsx
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

// ─── EXCEL PARSER ────────────────────────────────────────────
function inferSessionType(desc) {
  if (!desc) return 'REST';
  const d = desc.toString();
  if (/SABBATH|REST|rest day/i.test(d)) return 'REST';
  if (/Recovery|Easy w\//i.test(d)) return 'RECOVERY';
  if (/Warm Up/i.test(d) && /400m|800m|200m|\d+km @|\d+ x \d+min|\d+min @/i.test(d) && !/MP|HMP|marathon pace|tempo/i.test(d)) return 'SPEED';
  if (/Warm Up/i.test(d) && /MP|HMP|marathon|tempo|\d+min @/i.test(d)) return 'TEMPO';
  if (/Strides/i.test(d)) return 'EASY + STRIDES';
  if (/\d{2,3} min Easy|\d{2,3}min Easy|Long/i.test(d)) return 'LONG RUN';
  if (/Easy/i.test(d)) return 'EASY';
  return 'EASY';
}

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

          const dayHeaders = rows[1]; // [null, MON, TUE, WED, THU, FRI, SAT, SUN]
          const dateRow = rows[2];    // [null, Date, Date, ...]
          const runRow = rows[3];     // [RUN, desc1, desc2, ...]
          const terrainRow = rows[4]; // [TERRAIN, t1, t2, ...]
          const paceRow = rows[6];    // [PACES, p1, p2, ...]
          const kmRow = rows[7];      // [Est. Weekly KM:, label]

          // Determine week start from Monday date (column 1 of date row)
          let weekStart = '';
          let mondayDate = dateRow ? dateRow[1] : null; // column 1 = Monday
          if (mondayDate) {
            const d = mondayDate instanceof Date ? mondayDate : new Date(mondayDate);
            if (!isNaN(d)) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              weekStart = `${y}-${m}-${day}`;
            }
          }
          // Fallback: try parsing sheet name as dd‑mm (old behavior)
          if (!weekStart) {
            const parts = sheetName.split('-');
            if (parts.length >= 2) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              weekStart = `2026-${month}-${day}`;
            }
          }

          const kmLabel = kmRow ? (kmRow[1] || '') : '';
          const weekLabel = sheetName + (kmLabel ? ` · ${kmLabel}` : '');

          const sessions = [];
          const days = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

          days.forEach((day, i) => {
            const colIdx = i + 1;
            const desc = runRow ? (runRow[colIdx] || '') : '';
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
            const tag = getTagFromType(type);

            sessions.push({
              id: `upload-${sheetName}-${i}-${Date.now()}`,
              day: dayStr,
              type,
              tag,
              desc: desc.toString().trim(),
              pace: pace ? pace.toString().trim() : '',
              terrain: terrain ? terrain.toString().trim() : '',
            });
          });

          if (sessions.length > 0) {
            weeks.push({ weekLabel, weekStart, sessions });
          }
        });

        resolve(weeks);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

const SESSION_TYPES = [
  'LONG RUN',
  'SPEED',
  'TEMPO',
  'EASY',
  'EASY + STRIDES',
  'RECOVERY',
  'REST'
];

const getTagFromType = (type) => {
  if (['SPEED', 'EASY + STRIDES'].includes(type)) return 'speed';
  if (type === 'TEMPO') return 'tempo';
  if (type === 'REST') return 'rest';
  return 'easy';
};

const styles = {
  container: {
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    boxSizing: 'border-box'
  },
  header: {
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    color: '#fff'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '16px',
    backgroundColor: '#2d2d2d',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '6px',
    marginBottom: '20px',
    boxSizing: 'border-box'
  },
  section: {
    marginBottom: '24px'
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px',
    color: '#bbb'
  },
  row: {
    display: 'flex',
    gap: '8px',
    marginBottom: '8px',
    flexWrap: 'wrap'
  },
  input: {
    flex: '1 1 auto',
    minWidth: '100px',
    padding: '10px 12px',
    fontSize: '14px',
    backgroundColor: '#2d2d2d',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '6px',
    boxSizing: 'border-box'
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    backgroundColor: '#2d2d2d',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '6px',
    minHeight: '60px',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  button: {
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  addBtn: {
    backgroundColor: '#3d5afe',
    color: '#fff',
    marginTop: '8px'
  },
  deleteBtn: {
    backgroundColor: '#d32f2f',
    color: '#fff',
    padding: '8px 12px',
    fontSize: '12px'
  },
  saveBtn: {
    backgroundColor: '#2e7d32',
    color: '#fff',
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    marginTop: '16px'
  },
  weekCard: {
    backgroundColor: '#252525',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    border: '1px solid #333'
  },
  weekHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
    flexWrap: 'wrap',
    gap: '8px'
  },
  weekLabel: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff'
  },
  sessionCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid #333'
  },
  sessionType: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '4px',
    display: 'inline-block',
    marginBottom: '8px',
    fontWeight: '600'
  },
  tagBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    marginLeft: '8px',
    textTransform: 'uppercase'
  },
  noData: {
    textAlign: 'center',
    color: '#666',
    padding: '32px',
    fontSize: '14px'
  }
};

const getTypeColor = (type) => {
  switch (type) {
    case 'LONG RUN': return '#1565c0';
    case 'SPEED': return '#e65100';
    case 'TEMPO': return '#6a1b9a';
    case 'EASY': return '#2e7d32';
    case 'EASY + STRIDES': return '#ef6c00';
    case 'RECOVERY': return '#00838f';
    case 'REST': return '#616161';
    default: return '#424242';
  }
};

const getTagColor = (tag) => {
  switch (tag) {
    case 'speed': return '#ff5722';
    case 'tempo': return '#9c27b0';
    case 'rest': return '#757575';
    default: return '#4caf50';
  }
};

export default function CoachPlanBuilder({ athletes, onSave }) {
  const [selectedEmail, setSelectedEmail] = useState('');
  const [weeks, setWeeks] = useState([]);
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newWeekStart, setNewWeekStart] = useState('');
  const [showAddWeek, setShowAddWeek] = useState(false);
  const [uploadTarget, setUploadTarget] = useState('');
  const [uploadMode, setUploadMode] = useState('append'); // 'append' | 'replace'
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget) return;
    setUploading(true);
    try {
      const parsedWeeks = await parseExcelToWeeks(file);
      const existing = athletes[uploadTarget]?.weeks || [];
      const updated = uploadMode === 'replace' ? parsedWeeks : [...existing, ...parsedWeeks];
      onSave(uploadTarget, updated);
      setSelectedEmail(uploadTarget);
      alert(`✅ Imported ${parsedWeeks.length} weeks for ${athletes[uploadTarget]?.name || uploadTarget}`);
    } catch (err) {
      alert('❌ Failed to parse Excel: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const athleteList = Object.entries(athletes || {}).map(([email, data]) => ({
    email,
    name: data.name || email.split('@')[0]
  }));

  useEffect(() => {
    if (selectedEmail && athletes[selectedEmail]?.weeks) {
      setWeeks(athletes[selectedEmail].weeks);
    } else {
      setWeeks([]);
    }
  }, [selectedEmail, athletes]);

  const handleAddWeek = () => {
    if (!newWeekLabel || !newWeekStart) return;
    const newWeek = {
      id: Date.now().toString(),
      weekLabel: newWeekLabel,
      weekStart: newWeekStart,
      sessions: []
    };
    setWeeks([...weeks, newWeek]);
    setNewWeekLabel('');
    setNewWeekStart('');
    setShowAddWeek(false);
  };

  const handleDeleteWeek = (weekId) => {
    setWeeks(weeks.filter(w => w.id !== weekId));
  };

  const handleAddSession = (weekId) => {
    const newSession = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      day: '',
      type: 'EASY',
      tag: 'easy',
      pace: '',
      terrain: '',
      desc: ''
    };
    setWeeks(weeks.map(w => {
      if (w.id === weekId) {
        return { ...w, sessions: [...w.sessions, newSession] };
      }
      return w;
    }));
  };

  const handleSessionChange = (weekId, sessionId, field, value) => {
    setWeeks(weeks.map(w => {
      if (w.id === weekId) {
        const updatedSessions = w.sessions.map(s => {
          if (s.id === sessionId) {
            const updates = { [field]: value };
            if (field === 'type') {
              updates.tag = getTagFromType(value);
            }
            return { ...s, ...updates };
          }
          return s;
        });
        return { ...w, sessions: updatedSessions };
      }
      return w;
    }));
  };

  const handleDeleteSession = (weekId, sessionId) => {
    setWeeks(weeks.map(w => {
      if (w.id === weekId) {
        return { ...w, sessions: w.sessions.filter(s => s.id !== sessionId) };
      }
      return w;
    }));
  };

  const handleSave = () => {
    if (selectedEmail && onSave) {
      console.log('Saving plan for', selectedEmail, weeks.length, 'weeks');
      onSave(selectedEmail, weeks);
    } else {
      console.warn('Save called without selectedEmail or onSave');
    }
  };

  const selectedAthlete = athletes?.[selectedEmail];

  return (
    <div style={styles.container}>
      <div style={styles.header}>🏃 Coach Dashboard</div>

      {/* ── Excel Upload ── */}
      <div style={{ background:'#252525', borderRadius:8, padding:16, marginBottom:20, border:'1px solid #333' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#bbb', marginBottom:10 }}>📥 Import from Excel</div>
        <select style={styles.select} value={uploadTarget} onChange={e => setUploadTarget(e.target.value)}>
          <option value="">Select athlete to import into...</option>
          {athleteList.map(a => <option key={a.email} value={a.email}>{a.name}</option>)}
        </select>
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {['append','replace'].map(mode => (
            <button key={mode} onClick={() => setUploadMode(mode)}
              style={{ ...styles.button, flex:1, background: uploadMode===mode ? '#3d5afe' : '#444', color:'#fff', fontSize:13 }}>
              {mode === 'append' ? '➕ Append weeks' : '🔄 Replace all'}
            </button>
          ))}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={handleExcelUpload} />
        <button
          style={{ ...styles.button, ...styles.addBtn, width:'100%', opacity: !uploadTarget ? 0.5 : 1 }}
          disabled={!uploadTarget || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Importing...' : '📂 Choose Excel File (.xlsx)'}
        </button>
      </div>

      <select
        style={styles.select}
        value={selectedEmail}
        onChange={(e) => setSelectedEmail(e.target.value)}
      >
        <option value="">Select an athlete...</option>
        {athleteList.map(athlete => (
          <option key={athlete.email} value={athlete.email}>
            {athlete.name} ({athlete.email})
          </option>
        ))}
      </select>

      {selectedEmail && (
        <>
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Weeks</div>
            
            {weeks.map(week => (
              <div key={week.id} style={styles.weekCard}>
                <div style={styles.weekHeader}>
                  <div>
                    <span style={styles.weekLabel}>{week.weekLabel}</span>
                    <span style={{ marginLeft: '12px', color: '#888', fontSize: '14px' }}>
                      {week.weekStart}
                    </span>
                  </div>
                  <button
                    style={{ ...styles.button, ...styles.deleteBtn }}
                    onClick={() => handleDeleteWeek(week.id)}
                  >
                    Delete Week
                  </button>
                </div>

                {week.sessions.map(session => (
                  <div key={session.id} style={styles.sessionCard}>
                    <div style={styles.row}>
                      <input
                        style={{ ...styles.input, flex: '0 0 80px' }}
                        placeholder="Day (e.g. Mon 24)"
                        value={session.day}
                        onChange={(e) => handleSessionChange(week.id, session.id, 'day', e.target.value)}
                      />
                      <select
                        style={{ ...styles.input, flex: '0 0 140px' }}
                        value={session.type}
                        onChange={(e) => handleSessionChange(week.id, session.id, 'type', e.target.value)}
                      >
                        {SESSION_TYPES.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                      <span style={{
                        ...styles.sessionType,
                        backgroundColor: getTypeColor(session.type),
                        color: '#fff'
                      }}>
                        {session.type}
                      </span>
                      <span style={{
                        ...styles.tagBadge,
                        backgroundColor: getTagColor(session.tag),
                        color: '#fff'
                      }}>
                        {session.tag}
                      </span>
                    </div>
                    <div style={styles.row}>
                      <input
                        style={styles.input}
                        placeholder="Pace (e.g. 5:00/km)"
                        value={session.pace}
                        onChange={(e) => handleSessionChange(week.id, session.id, 'pace', e.target.value)}
                      />
                      <input
                        style={styles.input}
                        placeholder="Terrain (e.g. trail, road)"
                        value={session.terrain}
                        onChange={(e) => handleSessionChange(week.id, session.id, 'terrain', e.target.value)}
                      />
                    </div>
                    <textarea
                      style={styles.textarea}
                      placeholder="Session description..."
                      value={session.desc}
                      onChange={(e) => handleSessionChange(week.id, session.id, 'desc', e.target.value)}
                    />
                    <button
                      style={{ ...styles.button, ...styles.deleteBtn, marginTop: '8px' }}
                      onClick={() => handleDeleteSession(week.id, session.id)}
                    >
                      Delete Session
                    </button>
                  </div>
                ))}

                <button
                  style={{ ...styles.button, ...styles.addBtn }}
                  onClick={() => handleAddSession(week.id)}
                >
                  + Add Session
                </button>
              </div>
            ))}

            {showAddWeek ? (
              <div style={styles.weekCard}>
                <div style={styles.row}>
                  <input
                    style={styles.input}
                    placeholder="Week Label (e.g. Week 1)"
                    value={newWeekLabel}
                    onChange={(e) => setNewWeekLabel(e.target.value)}
                  />
                  <input
                    type="date"
                    style={styles.input}
                    value={newWeekStart}
                    onChange={(e) => setNewWeekStart(e.target.value)}
                  />
                </div>
                <div style={styles.row}>
                  <button
                    style={{ ...styles.button, ...styles.addBtn, flex: '1' }}
                    onClick={handleAddWeek}
                  >
                    Add Week
                  </button>
                  <button
                    style={{ ...styles.button, backgroundColor: '#616161', color: '#fff', flex: '1' }}
                    onClick={() => setShowAddWeek(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                style={{ ...styles.button, ...styles.addBtn, width: '100%' }}
                onClick={() => setShowAddWeek(true)}
              >
                + Add Week
              </button>
            )}
          </div>

          <button
            style={{ ...styles.button, ...styles.saveBtn }}
            onClick={handleSave}
          >
            Save Plan
          </button>
        </>
      )}

      {!selectedEmail && (
        <div style={styles.noData}>
          Select an athlete to view and edit their training plan
        </div>
      )}
    </div>
  );
}
