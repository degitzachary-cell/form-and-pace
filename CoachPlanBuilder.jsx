import React, { useState, useEffect } from 'react';

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

  const athleteList = Object.entries(athletes || {}).map(([email, data]) => ({
    email,
    name: data.name || email.split('@')[0]
  }));

  useEffect(() => {
    if (selectedEmail && athletes[selectedEmail]?.plan) {
      setWeeks(athletes[selectedEmail].plan);
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
      onSave(selectedEmail, weeks);
    }
  };

  const selectedAthlete = athletes?.[selectedEmail];

  return (
    <div style={styles.container}>
      <div style={styles.header}>🏃 Coach Dashboard</div>

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
