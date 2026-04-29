import { useState } from "react";
import { C, S } from "./styles.js";
import { fmtPace, fmtTime } from "./lib/helpers.js";
import {
  computeRtss, getThresholdPace, rtssColor,
  timeInZone, ZONE_LABELS, ZONE_COLORS, ZONE_NAMES,
  paceStrToSecsPerKm, computePMC, densifyDailyRtss,
} from "./lib/load.js";

// ─── TRAINING-LOAD PILLS ─────────────────────────────────────────────────────

// Renders a small "rTSS 64" pill colored by load band. Pure presentational —
// callers pass a precomputed rtss number, or use <RtssPillFor /> below to
// derive it from a run + profile.
export function RtssPill({ rtss, size = 11 }) {
  if (rtss == null) return null;
  return (
    <span style={{
      display:"inline-flex", alignItems:"center", gap:6,
      padding:"3px 9px", borderRadius:999,
      border:`1px solid ${rtssColor(rtss)}`,
      color: rtssColor(rtss),
      fontFamily:"var(--f-mono)", fontSize:size, letterSpacing:"0.04em",
      fontVariantNumeric:"tabular-nums",
    }}>
      <span style={{ opacity:0.7 }}>rTSS</span>
      <span style={{ fontWeight:600 }}>{rtss}</span>
    </span>
  );
}

// Convenience: derive rTSS from a run + the athlete's profile (for the
// threshold pace) and render the pill. Returns null if not enough data.
export function RtssPillFor({ durationMin, distanceKm, profile, size = 11 }) {
  const thr = getThresholdPace(profile);
  if (!thr || !durationMin || !distanceKm) return null;
  const rtss = computeRtss({
    durationSec: durationMin * 60,
    distanceKm,
    thresholdSecsPerKm: thr,
  });
  return <RtssPill rtss={rtss} size={size}/>;
}

// ─── MOBILE TAB BAR ──────────────────────────────────────────────────────────
// Sticky bottom nav for the athlete on small screens. Four destinations:
// Today / Week / Log / Profile. Hairline-top, paper background, ink dot
// under the active item. No hover effects; tap-only.
//
// `current` is one of: "today" | "home" | "log" | "profile". The Log tab is
// special — instead of a standalone screen, tapping it routes the parent
// into the log-activity flow via `onTapLog`. All other taps call onTab(name).
//
// Hidden on tablet/desktop where a different navigation pattern applies.
export function MobileTabBar({ current, onTab, onTapLog, isDesktop }) {
  if (isDesktop) return null;

  const Item = ({ name, label, glyph, onClick }) => {
    const active = current === name;
    return (
      <button
        onClick={onClick}
        style={{
          flex: 1, background: "transparent", border: 0,
          padding: "10px 4px 8px",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          cursor: "pointer", color: active ? "var(--c-ink)" : "var(--c-mute)",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 18 }}>
          {glyph}
        </div>
        <span className="t-mono" style={{
          fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase",
          fontWeight: active ? 600 : 500,
        }}>{label}</span>
        <span style={{
          width: 4, height: 4, borderRadius: 999,
          background: active ? "var(--c-ink)" : "transparent",
          marginTop: 1,
        }}/>
      </button>
    );
  };

  // All glyphs are stroke-only SVG to match the spec's "no decorative icons"
  // rule — these are wayfinding marks, drawn at hairline weight in current
  // color so they inherit the active/inactive ink/mute treatment.
  const sw = 1.4;
  const Today = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="11" stroke="currentColor" strokeWidth={sw}/>
      <line x1="2.5" y1="6.5" x2="15.5" y2="6.5" stroke="currentColor" strokeWidth={sw}/>
      <circle cx="9" cy="10.5" r="1.4" fill="currentColor"/>
    </svg>
  );
  const Week = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="11" stroke="currentColor" strokeWidth={sw}/>
      <line x1="2.5"  y1="7" x2="15.5" y2="7" stroke="currentColor" strokeWidth={sw}/>
      <line x1="6.5"  y1="3.5" x2="6.5"  y2="14.5" stroke="currentColor" strokeWidth={sw}/>
      <line x1="11.5" y1="3.5" x2="11.5" y2="14.5" stroke="currentColor" strokeWidth={sw}/>
    </svg>
  );
  const Log = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <line x1="9" y1="3" x2="9"  y2="15" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
      <line x1="3" y1="9" x2="15" y2="9"  stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );
  const Profile = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="6.2" r="2.6" stroke="currentColor" strokeWidth={sw}/>
      <path d="M3.5 15.5 C 4.5 11.8, 13.5 11.8, 14.5 15.5"
            stroke="currentColor" strokeWidth={sw} strokeLinecap="round" fill="none"/>
    </svg>
  );

  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0,
      background: "var(--c-bg)",
      borderTop: "1px solid var(--c-rule)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      zIndex: 50,
    }}>
      <div style={{ maxWidth: 500, margin: "0 auto", display: "flex" }}>
        <Item name="today"   label="Today"   glyph={Today}   onClick={() => onTab("today")}/>
        <Item name="home"    label="Week"    glyph={Week}    onClick={() => onTab("home")}/>
        <Item name="log"     label="Log"     glyph={Log}     onClick={onTapLog}/>
        <Item name="profile" label="Profile" glyph={Profile} onClick={() => onTab("profile")}/>
      </div>
    </div>
  );
}

// ─── THREAD PANEL ────────────────────────────────────────────────────────────
// Renders a chronological thread of athlete↔coach messages plus an inline
// reply box. Pure presentational — owner provides the thread array (already
// blended via lib/messages.js getThread) and an onSend(body) callback.
//
// `viewerRole` flips alignment + highlight: messages from the OTHER party
// sit on the paper-card side, the viewer's own messages float in plain text
// on the right.
export function ThreadPanel({ thread = [], viewerRole = "athlete", onSend }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const otherAuthor = viewerRole === "coach" ? "athlete" : "coach";
  const sectionLabel = viewerRole === "coach" ? "Reply to athlete" : "Coach thread";
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ padding: "0 0 12px", borderBottom: "1px solid var(--c-rule)", display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
        <span className="t-eyebrow" style={{ color:"var(--c-ink)" }}>{sectionLabel}</span>
        {thread.length > 0 && <span className="t-mono" style={{ fontSize:10, color:"var(--c-mute)", letterSpacing:"0.08em" }}>{thread.length} MESSAGE{thread.length === 1 ? "" : "S"}</span>}
      </div>
      <div style={{ marginTop: 14, display:"flex", flexDirection:"column", gap:12 }}>
        {thread.map(m => {
          const isOther = m.author === otherAuthor;
          return (
            <div key={m.id} style={{
              display:"flex",
              flexDirection: isOther ? "row" : "row-reverse",
              alignItems:"flex-start",
              gap:10,
            }}>
              <div style={{
                maxWidth: "85%",
                padding: isOther ? "14px 16px" : "10px 14px",
                background: isOther ? "var(--c-paper)" : "transparent",
                border: isOther ? "1px solid var(--c-rule)" : "none",
                borderLeft: isOther ? "2px solid var(--c-accent)" : "none",
              }}>
                <div className="t-mono" style={{ fontSize:9, letterSpacing:"0.14em", color:"var(--c-mute)", marginBottom:6 }}>
                  {m.author === "coach" ? "COACH" : "ATHLETE"}
                  {m.created_at && ` · ${new Date(m.created_at).toLocaleString(undefined, { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })}`}
                </div>
                <div style={{
                  fontFamily: isOther ? "var(--f-display)" : "var(--f-body)",
                  fontSize: isOther ? 17 : 15,
                  lineHeight: 1.55,
                  color:"var(--c-ink)",
                  whiteSpace:"pre-wrap",
                }}>
                  {m.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={viewerRole === "coach" ? "Reply to your athlete…" : "Write back to your coach…"}
          style={{
            width:"100%", minHeight:80, padding:"12px 14px",
            background:"var(--c-paper)", border:"1px solid var(--c-rule)", borderRadius:2,
            color:"var(--c-ink)", fontFamily:"var(--f-display)", fontSize:16, lineHeight:1.5,
            resize:"vertical", outline:"none",
          }}
        />
        <button
          onClick={async () => {
            if (!draft.trim() || sending) return;
            setSending(true);
            try { await onSend(draft); setDraft(""); }
            catch (e) { console.error("send message failed", e); }
            finally { setSending(false); }
          }}
          disabled={!draft.trim() || sending}
          className="fp-btn fp-btn--accent"
          style={{ marginTop:10, padding:"10px 20px", fontSize:11, opacity: !draft.trim() || sending ? 0.5 : 1 }}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

// ─── PMC CHART (CTL / ATL / TSB) ─────────────────────────────────────────────
//
// Minimal hand-rolled SVG line chart — keeps the bundle lean (no recharts).
// Three lines: CTL (fitness, accent terracotta, thick), ATL (fatigue, hot,
// thinner), TSB (form, shown as filled bars beneath the zero line so
// over-/under-training is visually obvious). Daily rTSS shown as faint
// vertical bars in the background.
//
// `dailyRtss` is an array of { date: 'YYYY-MM-DD', rtss }. The chart
// densifies to daily, computes PMC, and renders.
export function PMCChart({ dailyRtss, fromDate, toDate, height = 200 }) {
  const dense = densifyDailyRtss(dailyRtss || [], fromDate, toDate);
  const pmc = computePMC(dense);
  if (pmc.length < 2) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--c-mute)", fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: 14 }}>
        Not enough data yet — log a few weeks of runs and CTL/ATL will start to draw.
      </div>
    );
  }
  const VB_W = 600, VB_H = height;
  const PAD_L = 40, PAD_R = 12, PAD_T = 14, PAD_B = 22;
  const innerW = VB_W - PAD_L - PAD_R;
  const innerH = VB_H - PAD_T - PAD_B;

  const N = pmc.length;
  const maxLoad = Math.max(40, ...pmc.map(p => p.ctl), ...pmc.map(p => p.atl));
  const yLoad = (v) => PAD_T + (1 - v / maxLoad) * innerH;
  const x = (i) => PAD_L + (i * innerW) / Math.max(1, N - 1);

  const ctlPath = pmc.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yLoad(p.ctl).toFixed(1)}`).join(" ");
  const atlPath = pmc.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yLoad(p.atl).toFixed(1)}`).join(" ");

  // TSB drawn against zero-axis at the bottom band (below load lines).
  // We map TSB to the bottom 30% of the chart, with zero in the middle of
  // that band so positive (fresh) goes up and negative (fatigued) goes down.
  const tsbBandTop = PAD_T + innerH * 0.7;
  const tsbBandH = innerH * 0.28;
  const tsbZeroY = tsbBandTop + tsbBandH / 2;
  const maxTsb = Math.max(10, ...pmc.map(p => Math.abs(p.tsb)));
  const yTsb = (v) => tsbZeroY - (v / maxTsb) * (tsbBandH / 2);

  const last = pmc[pmc.length - 1];

  return (
    <div>
      <div style={{ display: "flex", gap: 18, marginBottom: 8, flexWrap: "wrap" }}>
        <div>
          <div className="t-eyebrow">Fitness · CTL</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, color: "var(--c-accent)", fontWeight: 600 }}>{last.ctl.toFixed(1)}</div>
        </div>
        <div>
          <div className="t-eyebrow">Fatigue · ATL</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, color: "var(--c-hot)", fontWeight: 600 }}>{last.atl.toFixed(1)}</div>
        </div>
        <div>
          <div className="t-eyebrow">Form · TSB</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 18, color: last.tsb >= 0 ? "var(--c-cool)" : "var(--c-warn)", fontWeight: 600 }}>
            {last.tsb >= 0 ? "+" : ""}{last.tsb.toFixed(1)}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block" }}>
        {/* axis lines */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={VB_H - PAD_B} stroke="var(--c-rule)" strokeWidth="0.5"/>
        <line x1={PAD_L} y1={VB_H - PAD_B} x2={VB_W - PAD_R} y2={VB_H - PAD_B} stroke="var(--c-rule)" strokeWidth="0.5"/>
        {/* y-axis ticks */}
        {[0, 0.5, 1].map(t => {
          const v = Math.round(maxLoad * t);
          return (
            <g key={t}>
              <line x1={PAD_L} y1={yLoad(v)} x2={VB_W - PAD_R} y2={yLoad(v)} stroke="var(--c-ruleSoft)" strokeWidth="0.4" strokeDasharray="2 3"/>
              <text x={PAD_L - 6} y={yLoad(v) + 3} textAnchor="end" fontSize="9" fill="var(--c-mute)" fontFamily="var(--f-mono)">{v}</text>
            </g>
          );
        })}
        {/* daily rTSS as faint background bars */}
        {pmc.map((p, i) => p.rtss > 0 && (
          <rect key={i}
            x={x(i) - 0.8} y={yLoad(p.rtss)}
            width="1.6" height={Math.max(0.5, (VB_H - PAD_B) - yLoad(p.rtss))}
            fill="var(--c-ruleSoft)"/>
        ))}
        {/* TSB filled area */}
        <line x1={PAD_L} y1={tsbZeroY} x2={VB_W - PAD_R} y2={tsbZeroY} stroke="var(--c-rule)" strokeWidth="0.4"/>
        {pmc.map((p, i) => {
          const yp = yTsb(p.tsb);
          const h = Math.abs(yp - tsbZeroY);
          const top = Math.min(yp, tsbZeroY);
          const fill = p.tsb >= 0 ? "var(--c-cool)" : "var(--c-warn)";
          return (
            <rect key={i} x={x(i) - 1} y={top} width="2" height={Math.max(0.5, h)} fill={fill} fillOpacity="0.45"/>
          );
        })}
        {/* CTL line */}
        <path d={ctlPath} fill="none" stroke="var(--c-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        {/* ATL line */}
        <path d={atlPath} fill="none" stroke="var(--c-hot)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        {/* date ticks: first / midpoint / last */}
        {[0, Math.floor(N/2), N - 1].map(i => (
          <text key={i} x={x(i)} y={VB_H - 6} textAnchor="middle" fontSize="9" fill="var(--c-mute)" fontFamily="var(--f-mono)">
            {pmc[i].date.slice(5)}
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 10, color: "var(--c-mute)", fontFamily: "var(--f-mono)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "var(--c-accent)", verticalAlign: "middle", marginRight: 5 }}/>CTL fitness</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "var(--c-hot)", verticalAlign: "middle", marginRight: 5 }}/>ATL fatigue</span>
        <span><span style={{ display: "inline-block", width: 6, height: 8, background: "var(--c-cool)", opacity: 0.45, verticalAlign: "middle", marginRight: 5 }}/>TSB form</span>
      </div>
    </div>
  );
}

// ─── TIME-IN-ZONE BAR ────────────────────────────────────────────────────────
// A short stacked bar showing how the run was spent across Z1–Z5. Shows up
// best on activities with split data — for manual logs without splits, falls
// back to "all time in the zone the average pace lands in," which is
// approximate but useful at a glance.
export function ZoneBar({ splits, durationMin, distanceKm, profile, height = 6, showLabels = false }) {
  const thr = getThresholdPace(profile);
  if (!thr || !durationMin) return null;
  const tiz = timeInZone({
    splits,
    durationSec: durationMin * 60,
    distanceKm,
    thresholdSecsPerKm: thr,
  });
  if (!tiz.total) return null;
  return (
    <div>
      <div style={{ display:"flex", height, width:"100%", overflow:"hidden", borderRadius:1 }}>
        {ZONE_LABELS.map(z => {
          const pct = (tiz[z] / tiz.total) * 100;
          if (pct < 0.5) return null;
          return (
            <div key={z}
              title={`${ZONE_NAMES[z]} · ${Math.round(tiz[z]/60)}min (${Math.round(pct)}%)`}
              style={{ width:`${pct}%`, background: ZONE_COLORS[z] }}/>
          );
        })}
      </div>
      {showLabels && (
        <div style={{ display:"flex", marginTop:4, gap:8, flexWrap:"wrap" }}>
          {ZONE_LABELS.filter(z => tiz[z] > 0).map(z => {
            const pct = Math.round((tiz[z] / tiz.total) * 100);
            return (
              <span key={z} className="t-mono" style={{ fontSize:10, color:"var(--c-mute)", letterSpacing:"0.06em" }}>
                <span style={{ display:"inline-block", width:6, height:6, borderRadius:999, background:ZONE_COLORS[z], marginRight:5, verticalAlign:"middle" }}/>
                {z} {pct}%
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── EDITORIAL ATOMS (Form & Pace redesign) ──────────────────────────────────
// Shared low-level building blocks used by every redesigned screen. Pure
// presentational — no app state. Naming follows the design bundle.

export const Seal = ({ size = 18, color = "currentColor" }) => (
  <span className="fp-seal" style={{ fontSize: size, color }}>✻</span>
);

export const Eyebrow = ({ children, style, color }) => (
  <div className="t-eyebrow" style={{ color, ...style }}>{children}</div>
);

export const Rule = ({ soft, style }) => (
  <div className={soft ? "fp-rule-soft" : "fp-rule"} style={style} />
);

// Tabular numeric — used for paces, distances, splits.
export const Num = ({ children, size = 14, weight = 500, color, style }) => (
  <span className="t-mono" style={{ fontSize: size, fontWeight: weight, color: color || "var(--c-ink)", ...style }}>{children}</span>
);

// Big editorial display numeral.
export const BigNum = ({ children, size = 64, color, style }) => (
  <span className="t-display" style={{ fontSize: size, color: color || "var(--c-ink)", fontWeight: 400, ...style }}>{children}</span>
);

// Section header like "01 / 03  ·  THIS WEEK"
export const SectionHead = ({ index, total, label, action }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 12px", borderBottom: "1px solid var(--c-rule)" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      {(index || total) && (
        <span className="t-mono" style={{ fontSize: 11, color: "var(--c-mute)", letterSpacing: "0.1em" }}>
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      )}
      <span className="t-eyebrow" style={{ color: "var(--c-ink)" }}>{label}</span>
    </div>
    {action}
  </div>
);

// Workout type → editorial dot color + label. Independent of the legacy
// TYPE_STYLE map (which handles backgrounds for logged cards). Used wherever
// we want the desaturated dot palette of the redesign.
export const TYPE_META = {
  EASY:       { dot: "var(--c-accent)", label: "Easy" },
  RECOVERY:   { dot: "var(--c-cool)",   label: "Recovery" },
  LONG:       { dot: "#7B5A8C",         label: "Long" },
  "LONG RUN": { dot: "#7B5A8C",         label: "Long" },
  TEMPO:      { dot: "var(--c-warn)",   label: "Tempo" },
  SPEED:      { dot: "var(--c-hot)",    label: "Speed" },
  RACE:       { dot: "var(--c-ink)",    label: "Race" },
  "RACE DAY": { dot: "var(--c-ink)",    label: "Race" },
  REST:       { dot: "var(--c-mute)",   label: "Rest" },
  STRENGTH:   { dot: "#5A6B7B",         label: "Strength" },
  HYROX:      { dot: "#C79541",         label: "Hyrox" },
};
export const typeMeta = (type) => {
  if (!type) return TYPE_META.EASY;
  const k = String(type).toUpperCase().trim();
  return TYPE_META[k] || TYPE_META[k.split(" ")[0]] || TYPE_META.EASY;
};

// Tonal back arrow (display serif).
export const BackArrow = ({ onClick }) => (
  <button onClick={onClick} aria-label="Back"
    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-inkSoft)", fontSize: 22, padding: 0, lineHeight: 1, fontFamily: "var(--f-display)" }}>
    ←
  </button>
);

// Small serif checkmark.
export const Tick = ({ size = 12, color = "var(--c-accent)" }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M2 6.5 L5 9.5 L10 3" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Editorial masthead used at the top of each screen — small seal + wordmark
// on the left, contextual label on the right, then a hairline rule.
export const Masthead = ({ context, right, hot = true }) => (
  <>
    <div style={{ padding: "20px 24px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Seal size={20} color={hot ? "var(--c-hot)" : "var(--c-ink)"} />
        <span className="t-mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: "var(--c-mute)" }}>FORM &amp; PACE</span>
        {context && <span className="t-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--c-mute)" }}>· {context}</span>}
      </div>
      {right}
    </div>
    <Rule />
  </>
);

// ─── HEADER ───────────────────────────────────────────────────────────────────
export function Header({ title, subtitle, right, onBack }) {
  return (
    <div style={{ background:"var(--c-bg)", borderBottom:`1px solid var(--c-rule)`, padding:"16px 22px", display:"flex", alignItems:"center", gap:14, position:"sticky", top:0, zIndex:10 }}>
      {onBack
        ? <BackArrow onClick={onBack}/>
        : <Seal size={20} color="var(--c-hot)"/>}
      <div style={{ flex:1, minWidth:0 }}>
        <div className="t-eyebrow" style={{ marginBottom:2 }}>{subtitle}</div>
        <div className="t-display" style={{ fontSize:22, fontWeight:500, color:"var(--c-ink)", lineHeight:1.05, letterSpacing:"-0.01em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{title}</div>
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
          <span className="t-mono" style={{ fontSize:11, letterSpacing:"0.16em", color:"var(--c-mute)" }}>STRAVA</span>
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
          <span className="t-mono" style={{ fontSize:11, letterSpacing:"0.16em", color:"var(--c-mute)" }}>STRAVA</span>
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
          Import from Strava
        </button>
      ) : loading ? (
        <div style={{ textAlign:"center", padding:"12px 0", color:C.green, fontSize:13 }}>Loading Strava activities…</div>
      ) : (
        <div>
          <div style={{ fontSize:10, letterSpacing:2, color:C.accent, textTransform:"uppercase", marginBottom:6 }}>Select Strava Activity</div>
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
