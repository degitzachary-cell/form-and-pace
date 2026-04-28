import { useState } from "react";
import { C, S } from "./styles.js";
import { fmtPace, fmtTime } from "./lib/helpers.js";

// ─── HEADER ───────────────────────────────────────────────────────────────────
export function Header({ title, subtitle, right, onBack }) {
  return (
    <div style={{ background:C.cream, borderBottom:`1px solid ${C.rule}`, padding:"16px 20px", display:"flex", alignItems:"center", gap:12, position:"sticky", top:0, zIndex:10 }}>
      {onBack && <button onClick={onBack} aria-label="Back" style={{ background:"none", border:"none", color:C.mid, cursor:"pointer", fontSize:22, padding:"0 6px 0 0", lineHeight:1 }}>‹</button>}
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10, color:C.mid, letterSpacing:2, textTransform:"uppercase" }}>{subtitle}</div>
        <div style={{ fontSize:17, fontWeight:800, fontFamily:S.displayFont, color:C.navy }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

export function SectionCard({ label, children, accent }) {
  return (
    <div style={{ background:C.white, border:`1px solid ${accent?C.rule:C.lightRule}`, borderLeft:`3px solid ${accent||C.lightRule}`, borderRadius:2, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ fontSize:10, letterSpacing:2, color:accent||C.mid, textTransform:"uppercase", marginBottom:10 }}>{label}</div>
      {children}
    </div>
  );
}

export function StatPill({ label, val, color }) {
  return (
    <div style={{ flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 8px", textAlign:"center" }}>
      <div style={{ fontSize:10, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:800, color:color||C.navy }}>{val}</div>
    </div>
  );
}

export function MiniStat({ label, val, color }) {
  return (
    <div>
      <div style={{ fontSize:10, color:C.mid, letterSpacing:2, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:13, color:color||C.navy, fontWeight:600 }}>{val}</div>
    </div>
  );
}

// ─── STRAVA CARD (merged from StravaDetailCard + StravaDataCard) ──────────────
export function StravaCard({ data, onClear }) {
  const [showHRGraph, setShowHRGraph] = useState(false);
  if (!data) return null;

  const hasHR    = data.splits?.some(s => s.avg_heartrate);
  const hasCad   = data.splits?.some(s => s.avg_cadence);
  const hasLaps  = data.laps?.length > 1;
  const splits   = hasLaps ? data.laps : data.splits;
  const splitLabel = hasLaps ? "Laps" : "Splits (1km)";
  const hrGraphData = splits?.filter(sp => sp.avg_heartrate) || [];
  const maxHRVal = hrGraphData.length ? Math.max(...hrGraphData.map(sp => sp.avg_heartrate)) : 0;
  const minHRVal = hrGraphData.length ? Math.min(...hrGraphData.map(sp => sp.avg_heartrate)) : 0;
  const hrColor = (hr) => hr > 170 ? "#f87171" : hr > 155 ? "#fb923c" : hr > 140 ? "#fbbf24" : "#4ade80";

  const tiles = [
    { label:"Distance",    val:(data.distance_m/1000).toFixed(2)+"km" },
    { label:"Moving Time", val:fmtTime(data.moving_time_s) },
    { label:"Elapsed",     val:fmtTime(data.elapsed_time_s) },
    { label:"Avg Pace",    val:fmtPace(data.avg_speed_mps) },
    ...(data.avg_heartrate    ? [{ label:"Avg HR",    val:Math.round(data.avg_heartrate)+"bpm", hrTile:true }] : []),
    ...(data.max_heartrate    ? [{ label:"Max HR",    val:Math.round(data.max_heartrate)+"bpm" }] : []),
    ...(data.elevation_gain_m != null ? [{ label:"Elevation", val:data.elevation_gain_m+"m" }] : []),
    ...(data.avg_cadence      ? [{ label:"Cadence",   val:data.avg_cadence+"spm" }] : []),
  ];

  return (
    <div style={{ background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"16px 18px", marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🟠</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>{data.name}</div>
            <div style={{ fontSize:10, color:C.green, letterSpacing:2, textTransform:"uppercase" }}>{onClear ? "Strava Imported" : "Strava Data"}</div>
          </div>
        </div>
        {onClear && <button onClick={onClear} style={{ background:"none", border:`1px solid ${C.rule}`, borderRadius:2, padding:"4px 10px", color:C.mid, fontSize:11, cursor:"pointer" }}>✕ Clear</button>}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom: splits?.length > 0 ? 14 : 0 }}>
        {tiles.map((s,i)=>(
          <div key={i} onClick={s.hrTile && hrGraphData.length ? ()=>setShowHRGraph(v=>!v) : undefined}
            style={{ background: s.hrTile && showHRGraph ? "#eef6ec" : C.white, borderRadius:2, padding:"8px 10px", textAlign:"center", cursor: s.hrTile && hrGraphData.length ? "pointer" : "default", border: s.hrTile && showHRGraph ? "1px solid #b8d4b4" : `1px solid ${C.lightRule}` }}>
            <div style={{ fontSize:13, fontWeight:700, color: s.hrTile ? C.crimson : C.navy }}>{s.val}</div>
            <div style={{ fontSize:9, color:C.mid, letterSpacing:1, textTransform:"uppercase", marginTop:2 }}>{s.label}{s.hrTile && hrGraphData.length ? (showHRGraph ? " ▴" : " ▾") : ""}</div>
          </div>
        ))}
      </div>

      {showHRGraph && hrGraphData.length > 0 && (
        <div style={{ background:"#0a120a", borderRadius:2, border:"1px solid #1a3a1a", padding:"12px", marginBottom:14 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:10 }}>HR per {hasLaps ? "Lap" : "Split"}</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:64 }}>
            {splits.map((sp, i) => {
              const hr = sp.avg_heartrate;
              if (!hr) return <div key={i} style={{ flex:1 }}/>;
              const pct = maxHRVal > minHRVal ? 0.3 + ((hr - minHRVal) / (maxHRVal - minHRVal)) * 0.7 : 0.5;
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{ fontSize:8, color:C.mid, lineHeight:1 }}>{Math.round(hr)}</div>
                  <div style={{ width:"100%", height:`${pct * 100}%`, background:hrColor(hr), borderRadius:"2px 2px 0 0", minHeight:4 }}/>
                  <div style={{ fontSize:8, color:C.mid, lineHeight:1 }}>{sp.split ?? sp.lap_index ?? i+1}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", gap:10, marginTop:8, justifyContent:"center" }}>
            {[["#4ade80","< 140"],["#fbbf24","140–155"],["#fb923c","155–170"],["#f87171","> 170"]].map(([c,l])=>(
              <div key={l} style={{ display:"flex", alignItems:"center", gap:3 }}>
                <div style={{ width:7, height:7, background:c, borderRadius:2 }}/>
                <div style={{ fontSize:9, color:C.mid }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {splits?.length > 0 && (
        <div>
          <div style={{ fontSize:10, letterSpacing:2, color:C.mid, textTransform:"uppercase", marginBottom:6 }}>{splitLabel}</div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ color:C.mid, textAlign:"left" }}>
                  <th style={{ padding:"4px 6px", fontWeight:400 }}>#</th>
                  <th style={{ padding:"4px 6px", fontWeight:400 }}>Dist</th>
                  <th style={{ padding:"4px 6px", fontWeight:400 }}>Time</th>
                  <th style={{ padding:"4px 6px", fontWeight:400 }}>Pace</th>
                  {hasHR  && <th style={{ padding:"4px 6px", fontWeight:400 }}>HR</th>}
                  {hasCad && <th style={{ padding:"4px 6px", fontWeight:400 }}>Cad</th>}
                </tr>
              </thead>
              <tbody>
                {splits.map((sp, i) => (
                  <tr key={i} style={{ borderTop:`1px solid ${C.lightRule}`, color:C.navy }}>
                    <td style={{ padding:"5px 6px", color:C.mid }}>{sp.split ?? sp.lap_index ?? i+1}</td>
                    <td style={{ padding:"5px 6px" }}>{(sp.distance_m/1000).toFixed(2)}km</td>
                    <td style={{ padding:"5px 6px" }}>{fmtTime(sp.moving_time_s)}</td>
                    <td style={{ padding:"5px 6px", color:C.crimson, fontWeight:600 }}>{fmtPace(sp.avg_speed_mps)}</td>
                    {hasHR  && <td style={{ padding:"5px 6px" }}>{sp.avg_heartrate ? Math.round(sp.avg_heartrate)+"bpm" : "–"}</td>}
                    {hasCad && <td style={{ padding:"5px 6px" }}>{sp.avg_cadence ? sp.avg_cadence+"spm" : "–"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STRAVA ACTIVITY PICKER ───────────────────────────────────────────────────
export function StravaActivityPicker({ activities, loading, selectedId, detail, detailLoading, onOpen, onSelect, onClear, compact }) {
  if (detail && compact) {
    return (
      <div style={{ background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 14px", marginBottom:14, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🟠</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.navy }}>{detail.name}</div>
            <div style={{ fontSize:11, color:C.green, letterSpacing:1 }}>STRAVA IMPORTED · {(detail.distance_m/1000).toFixed(2)}km</div>
          </div>
        </div>
        <button onClick={onClear} style={{ background:"none", border:`1px solid ${C.rule}`, borderRadius:2, padding:"4px 10px", color:C.mid, fontSize:11, cursor:"pointer" }}>✕ Clear</button>
      </div>
    );
  }
  if (detail) return <StravaCard data={detail} onClear={onClear} />;

  return (
    <div style={{ marginBottom:14 }}>
      {!activities.length && !loading ? (
        <button type="button" onClick={onOpen} style={{ width:"100%", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px", color:C.green, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <span style={{ fontSize:16 }}>🟠</span> Import from Strava
        </button>
      ) : loading ? (
        <div style={{ textAlign:"center", padding:"12px 0", color:C.green, fontSize:13 }}>Loading Strava activities…</div>
      ) : (
        <div>
          <div style={{ fontSize:10, letterSpacing:2, color:C.green, textTransform:"uppercase", marginBottom:6 }}>🟠 Select Strava Activity</div>
          <select
            value={selectedId || ""}
            onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)}
            style={{ width:"100%", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 14px", color: selectedId ? C.navy : C.mid, fontSize:14, boxSizing:"border-box", outline:"none" }}
          >
            <option value="">— Choose a run —</option>
            {activities.map(a => {
              const d = new Date(a.start_date_local);
              const dateStr = d.toLocaleDateString("en-AU",{day:"numeric",month:"short"});
              const km = (a.distance/1000).toFixed(1);
              const mins = Math.round(a.moving_time/60);
              return (
                <option key={a.id} value={a.id}>
                  {dateStr} · {a.name} · {km}km · {mins}min
                </option>
              );
            })}
          </select>
          {detailLoading && <div style={{ fontSize:12, color:C.green, marginTop:6, textAlign:"center" }}>Fetching detail…</div>}
        </div>
      )}
    </div>
  );
}
