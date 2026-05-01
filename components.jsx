import { useState } from "react";
import { C, S } from "./styles.js";
import { fmtPace, fmtTime } from "./lib/helpers.js";
import {
  computeRtss, getThresholdPace, rtssColor,
  timeInZone, ZONE_LABELS, ZONE_COLORS, ZONE_NAMES,
  paceStrToSecsPerKm, computePMC, densifyDailyRtss,
} from "./lib/load.js";

// ─── PACE INPUTS ─────────────────────────────────────────────────────────────
// Masked text input for paces. Accepts digits only and auto-formats as
// "M:SS" — typing "435" reads back as "4:35", "1234" as "12:34". The colon
// inserts itself when the user types the third digit. Backspace removes the
// last digit; the colon is virtual so it never gets stuck.
//
// `value` is the canonical "M:SS" string (or "" when empty). Used inside
// PaceRangeInput below and exported for reuse anywhere a single pace is
// captured.
export function PaceInput({ value, onChange, placeholder = "0:00", style, ariaLabel, autoFocus }) {
  const handleChange = (raw) => {
    const digits = String(raw || "").replace(/[^\d]/g, "").slice(0, 4);
    if (digits.length === 0)      onChange("");
    else if (digits.length === 1) onChange(digits);
    else if (digits.length === 2) onChange(digits[0] + ":" + digits[1]);
    else if (digits.length === 3) onChange(digits[0] + ":" + digits.slice(1));
    else                          onChange(digits.slice(0, 2) + ":" + digits.slice(2));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      value={value || ""}
      onChange={(e) => handleChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: 60,
        background: "var(--c-paper)",
        border: "1px solid var(--c-rule)",
        borderRadius: 2,
        padding: "6px 8px",
        fontFamily: "var(--f-mono)",
        fontSize: 13,
        color: "var(--c-ink)",
        textAlign: "center",
        fontVariantNumeric: "tabular-nums",
        outline: "none",
        ...style,
      }}
    />
  );
}

// Range pace picker — two PaceInputs joined by "–". Stores the value as a
// single string in one of three shapes so existing code that reads
// `session.pace` keeps working without a schema change:
//   ""             empty
//   "4:35"         single pace
//   "4:32–4:38"    range (en-dash, no spaces)
// Either side is optional; if only one is filled, we save just that one.
export function PaceRangeInput({ value, onChange, label }) {
  // Lenient split — any en-dash / hyphen separates the two halves, even
  // mid-typing when one side is still a partial 'M' or 'M:S'. Colons are
  // never treated as separators.
  const parsed = (() => {
    const v = String(value || "");
    if (!v) return ["", ""];
    const parts = v.split(/\s*[–-]\s*/);
    if (parts.length >= 2) return [parts[0], parts.slice(1).join("")];
    return [v, ""];
  })();
  // Always join with the en-dash when there's a 'high' component, even if
  // 'low' is empty — that keeps the second input editable while the first
  // is being cleared.
  const join = (lo, hi) => {
    if (!lo && !hi) return "";
    if (!hi)         return lo;
    return `${lo || ""}–${hi}`;
  };
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {label && <span className="t-eyebrow" style={{ color: "var(--c-mute)", marginRight: 2 }}>{label}</span>}
      <PaceInput value={parsed[0]} onChange={(lo) => onChange(join(lo, parsed[1]))} placeholder="0:00" ariaLabel="Pace low" />
      <span className="t-mono" style={{ fontSize: 12, color: "var(--c-mute)" }}>–</span>
      <PaceInput value={parsed[1]} onChange={(hi) => onChange(join(parsed[0], hi))} placeholder="0:00" ariaLabel="Pace high" />
      <span className="t-mono" style={{ fontSize: 11, color: "var(--c-mute)", letterSpacing: "0.06em" }}>/km</span>
    </div>
  );
}

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

// ─── LETTERHEAD REPLY MODAL ──────────────────────────────────────────────────
// Ceremonial reply experience for the coach. Opens over a scrim, displays
// the athlete's recap as a pull-quote, then a generous textarea for the
// coach to write back. Sign-off auto-line in mono mute. Saves as a normal
// thread message via onSend.
//
// Props:
//   open       — boolean controlling visibility
//   onClose    — close (× or ESC)
//   athleteName, coachName
//   recap      — the athlete's note/feedback to anchor the reply
//   recapByline — e.g. "8km tempo · 3 hours ago"
//   onSend(body) — async; on success the modal clears + closes
export function LetterheadReplyModal({ open, onClose, athleteName, coachName, recap, recapByline, onSend }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  if (!open) return null;
  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await onSend?.(draft);
      setDraft("");
      onClose?.();
    } catch (e) { console.error("letterhead send failed", e); }
    finally { setSending(false); }
  };
  const today = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(26, 24, 20, 0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--c-paper)", border: "1px solid var(--c-rule)",
        maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto",
        padding: "32px 36px",
      }}>
        {/* Letterhead header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="fp-seal" style={{ fontSize: 28, color: "var(--c-accent)" }}>✻</span>
          <button onClick={onClose}
            style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--c-mute)", fontSize: 20, fontFamily: "var(--f-display)", lineHeight: 1, padding: 0 }}
            aria-label="Close">×</button>
        </div>

        <div className="t-display-italic" style={{ fontSize: 16, color: "var(--c-mute)", marginBottom: 4 }}>
          From {coachName || "Coach"}
        </div>
        <div className="t-mono" style={{ fontSize: 11, color: "var(--c-mute)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 22 }}>
          {today}
        </div>

        {/* Athlete recap pull-quote */}
        {recap && (
          <div style={{ position: "relative", padding: "0 0 0 36px", marginBottom: 28 }}>
            <span style={{ position: "absolute", left: 0, top: -6, fontFamily: "var(--f-display)", fontSize: 56, color: "var(--c-rule)", lineHeight: 1, fontStyle: "italic" }}>“</span>
            <p style={{ fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: 17, lineHeight: 1.55, color: "var(--c-inkSoft)", margin: 0 }}>
              {recap}
            </p>
            {(recapByline || athleteName) && (
              <div className="t-mono" style={{ fontSize: 10, color: "var(--c-mute)", letterSpacing: "0.14em", marginTop: 10, textTransform: "uppercase" }}>
                — {athleteName || "Athlete"}{recapByline ? ` · ${recapByline}` : ""}
              </div>
            )}
          </div>
        )}

        {/* Reply textarea — display serif, big and quiet */}
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={athleteName ? `Write back to ${athleteName.split(" ")[0]}…` : "Write back…"}
          autoFocus
          style={{
            width: "100%", minHeight: 200, padding: "14px 0",
            background: "transparent", border: 0,
            borderTop: "1px solid var(--c-rule)", borderBottom: "1px solid var(--c-rule)",
            color: "var(--c-ink)",
            fontFamily: "var(--f-display)", fontSize: 20, lineHeight: 1.55,
            resize: "vertical", outline: "none",
          }}
        />

        {/* Sign-off auto-line */}
        <div className="t-mono" style={{ marginTop: 14, fontSize: 11, color: "var(--c-mute)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          — {coachName ? coachName.split(" ")[0] : "Coach"}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 28, alignItems: "center", justifyContent: "flex-end" }}>
          <button onClick={onClose} type="button"
            style={{ background: "transparent", border: 0, color: "var(--c-mute)", padding: "10px 14px", fontFamily: "var(--f-body)", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>
            Save draft
          </button>
          <button onClick={handleSend} type="button" disabled={!draft.trim() || sending}
            className="fp-btn fp-btn--accent"
            style={{ padding: "12px 24px", opacity: !draft.trim() || sending ? 0.5 : 1 }}>
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── COACH LEFT RAIL (desktop) ───────────────────────────────────────────────
// Heavy ink panel on the left edge, paper-tinted text. Five nav items
// (Dashboard / Athletes / Plans / Inbox / Library) with an inbox count badge,
// then a bottom hairline + Settings + Sign out. Reserved for desktop layouts;
// on mobile the coach uses the existing top-bar nav (rail returns null).
//
// `current` is the active screen key. `unread` is rendered as a small pill
// next to Inbox when > 0. `onNav` receives the clicked key.
export function CoachLeftRail({ current, onNav, unread = 0, coachName = "Coach", onSignOut, onSettings, isDesktop }) {
  if (!isDesktop) return null;

  const items = [
    { key: "dashboard", label: "Dashboard" },
    { key: "athletes", label: "Athletes" },
    { key: "plans",      label: "Plans" },
    { key: "atp",        label: "Season" },
    { key: "inbox",      label: "Inbox", badge: unread > 0 ? unread : null },
    { key: "library",    label: "Library" },
    { key: "compliance", label: "Compliance" },
  ];

  return (
    <aside style={{
      position: "sticky", top: 0,
      width: 220, minWidth: 220,
      height: "100vh",
      background: "var(--c-bgDeep)",
      color: "var(--c-paper)",
      borderRight: "1px solid var(--c-ink)",
      display: "flex", flexDirection: "column",
      padding: "28px 22px 22px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
        <span className="fp-seal" style={{ fontSize: 22, color: "var(--c-paper)" }}>✻</span>
        <span className="t-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: "var(--c-paper)" }}>FORM &amp; PACE</span>
      </div>

      <div style={{ marginBottom: 28, paddingBottom: 22, borderBottom: "1px solid var(--c-inkSoft)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 999,
            background: "var(--c-paper)", color: "var(--c-ink)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--f-display)", fontSize: 15, fontWeight: 500,
          }}>
            {(coachName || "C").slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 15, color: "var(--c-paper)", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{coachName}</div>
            <div className="t-mono" style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--c-mute)", marginTop: 2 }}>HEAD COACH</div>
          </div>
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {items.map(it => {
          const active = it.key === current;
          return (
            <button key={it.key} onClick={() => onNav?.(it.key)}
              style={{
                background: active ? "var(--c-ink)" : "transparent",
                border: 0, color: active ? "var(--c-paper)" : "var(--c-mute)",
                fontFamily: "var(--f-body)", fontSize: 13, fontWeight: active ? 600 : 500,
                letterSpacing: "0.04em",
                padding: "10px 12px", textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderLeft: active ? "2px solid var(--c-accent)" : "2px solid transparent",
              }}>
              <span>{it.label}</span>
              {it.badge != null && (
                <span style={{
                  background: "var(--c-accent)", color: "var(--c-accentInk)",
                  fontFamily: "var(--f-mono)", fontSize: 10,
                  padding: "2px 7px", borderRadius: 999, fontWeight: 600, letterSpacing: "0.04em",
                }}>{it.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ paddingTop: 22, borderTop: "1px solid var(--c-inkSoft)", display: "flex", flexDirection: "column", gap: 6 }}>
        <button onClick={onSettings}
          style={{ background: "transparent", border: 0, color: "var(--c-mute)", padding: "8px 12px", fontFamily: "var(--f-body)", fontSize: 12, textAlign: "left", cursor: "pointer", letterSpacing: "0.04em" }}>
          Settings
        </button>
        <button onClick={onSignOut}
          style={{ background: "transparent", border: 0, color: "var(--c-hot)", padding: "8px 12px", fontFamily: "var(--f-body)", fontSize: 12, textAlign: "left", cursor: "pointer", letterSpacing: "0.04em" }}>
          Sign out
        </button>
      </div>
    </aside>
  );
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
  const Calendar = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2.5" y="3.5" width="13" height="11" stroke="currentColor" strokeWidth={sw}/>
      <line x1="2.5" y1="6.5" x2="15.5" y2="6.5" stroke="currentColor" strokeWidth={sw}/>
      <line x1="6" y1="2.5" x2="6"  y2="4.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
      <line x1="12" y1="2.5" x2="12" y2="4.5" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"/>
      <circle cx="6" cy="9.5" r="0.8" fill="currentColor"/>
      <circle cx="9" cy="9.5" r="0.8" fill="currentColor"/>
      <circle cx="12" cy="9.5" r="0.8" fill="currentColor"/>
      <circle cx="6" cy="12" r="0.8" fill="currentColor"/>
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
        <Item name="today"    label="Today"    glyph={Today}    onClick={() => onTab("today")}/>
        <Item name="home"     label="Week"     glyph={Week}     onClick={() => onTab("home")}/>
        <Item name="calendar" label="Calendar" glyph={Calendar} onClick={() => onTab("calendar")}/>
        <Item name="log"      label="Log"      glyph={Log}      onClick={onTapLog}/>
        <Item name="profile"  label="Profile"  glyph={Profile}  onClick={() => onTab("profile")}/>
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
// Display window defaults to the last 90 days, but the chart computes PMC
// over whatever range is supplied via fromDate/toDate. To get an accurate CTL
// you want at least 4–6 months of data feeding in (CTL has a 42-day time
// constant and needs ~3× to warm up). Pass a fromDate that's 6 months before
// the visible window and the chart slices it for display automatically.
export function PMCChart({ dailyRtss, fromDate, toDate, displayDays = 90, height = 200 }) {
  const dense = densifyDailyRtss(dailyRtss || [], fromDate, toDate);
  const pmcAll = computePMC(dense);
  const pmc = pmcAll.length > displayDays ? pmcAll.slice(-displayDays) : pmcAll;
  if (pmc.length < 2) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--c-mute)", fontFamily: "var(--f-display)", fontStyle: "italic", fontSize: 14 }}>
        Not enough data yet — log a few weeks of runs and your fitness curve will start to draw.
      </div>
    );
  }
  const VB_W = 600, VB_H = height;
  const PAD_L = 36, PAD_R = 12, PAD_T = 10, PAD_B = 22;
  const innerW = VB_W - PAD_L - PAD_R;
  const innerH = VB_H - PAD_T - PAD_B;

  const N = pmc.length;
  // Reserve top 70% for CTL/ATL load lines, bottom 25% for TSB band, leaving a small gap.
  const loadBandH = innerH * 0.70;
  const tsbBandTop = PAD_T + innerH * 0.75;
  const tsbBandH = innerH * 0.25;
  const tsbZeroY = tsbBandTop + tsbBandH / 2;

  const maxLoad = Math.max(40, ...pmc.map(p => p.ctl), ...pmc.map(p => p.atl));
  const yLoad = (v) => PAD_T + (1 - v / maxLoad) * loadBandH;
  const x = (i) => PAD_L + (i * innerW) / Math.max(1, N - 1);

  const ctlPath = pmc.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yLoad(p.ctl).toFixed(1)}`).join(" ");
  const atlPath = pmc.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yLoad(p.atl).toFixed(1)}`).join(" ");

  const maxTsb = Math.max(10, ...pmc.map(p => Math.abs(p.tsb)));
  const yTsb = (v) => tsbZeroY - (v / maxTsb) * (tsbBandH / 2 - 2);

  const last = pmc[pmc.length - 1];
  const tsbHint = last.tsb > 5 ? "fresh — good to race" : last.tsb < -20 ? "very fatigued — ease off" : last.tsb < -10 ? "fatigued — training hard" : "balanced";
  const tsbColor = last.tsb >= 5 ? "var(--c-cool)" : last.tsb < -20 ? "var(--c-hot)" : last.tsb < 0 ? "var(--c-warn)" : "var(--c-ink)";

  return (
    <div>
      {/* Three headline numbers — plain-language labels with the technical name underneath */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div style={{ borderLeft: "2px solid var(--c-accent)", paddingLeft: 10 }}>
          <div className="t-eyebrow" style={{ marginBottom: 2 }}>Fitness</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 20, color: "var(--c-accent)", fontWeight: 600, lineHeight: 1 }}>{last.ctl.toFixed(0)}</div>
          <div style={{ fontSize: 9, color: "var(--c-mute)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.1em" }}>CTL · 42d</div>
        </div>
        <div style={{ borderLeft: "2px solid var(--c-hot)", paddingLeft: 10 }}>
          <div className="t-eyebrow" style={{ marginBottom: 2 }}>Fatigue</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 20, color: "var(--c-hot)", fontWeight: 600, lineHeight: 1 }}>{last.atl.toFixed(0)}</div>
          <div style={{ fontSize: 9, color: "var(--c-mute)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.1em" }}>ATL · 7d</div>
        </div>
        <div style={{ borderLeft: `2px solid ${tsbColor}`, paddingLeft: 10 }}>
          <div className="t-eyebrow" style={{ marginBottom: 2 }}>Form</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 20, color: tsbColor, fontWeight: 600, lineHeight: 1 }}>
            {last.tsb >= 0 ? "+" : ""}{last.tsb.toFixed(0)}
          </div>
          <div style={{ fontSize: 9, color: "var(--c-mute)", marginTop: 3, fontFamily: "var(--f-mono)", letterSpacing: "0.1em" }}>TSB · {tsbHint}</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" style={{ width: "100%", height: "auto", display: "block" }}>
        {/* y-axis grid (load band only) */}
        {[0, 0.5, 1].map(t => {
          const v = Math.round(maxLoad * t);
          return (
            <g key={t}>
              <line x1={PAD_L} y1={yLoad(v)} x2={VB_W - PAD_R} y2={yLoad(v)} stroke="var(--c-ruleSoft)" strokeWidth="0.4" strokeDasharray="2 3"/>
              <text x={PAD_L - 5} y={yLoad(v) + 3} textAnchor="end" fontSize="9" fill="var(--c-mute)" fontFamily="var(--f-mono)">{v}</text>
            </g>
          );
        })}

        {/* daily rTSS as faint background bars in the load band */}
        {pmc.map((p, i) => p.rtss > 0 && (
          <rect key={`r${i}`}
            x={x(i) - 0.8} y={yLoad(p.rtss)}
            width="1.6" height={Math.max(0.5, (PAD_T + loadBandH) - yLoad(p.rtss))}
            fill="var(--c-ruleSoft)"/>
        ))}

        {/* CTL line (fitness) */}
        <path d={ctlPath} fill="none" stroke="var(--c-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        {/* ATL line (fatigue) */}
        <path d={atlPath} fill="none" stroke="var(--c-hot)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2"/>

        {/* TSB band — separated below the load chart with a divider */}
        <line x1={PAD_L} y1={tsbBandTop - 2} x2={VB_W - PAD_R} y2={tsbBandTop - 2} stroke="var(--c-rule)" strokeWidth="0.5"/>
        <text x={PAD_L - 5} y={tsbZeroY + 3} textAnchor="end" fontSize="8" fill="var(--c-mute)" fontFamily="var(--f-mono)">TSB</text>
        <line x1={PAD_L} y1={tsbZeroY} x2={VB_W - PAD_R} y2={tsbZeroY} stroke="var(--c-rule)" strokeWidth="0.4" strokeDasharray="1 2"/>
        {pmc.map((p, i) => {
          const yp = yTsb(p.tsb);
          const h = Math.abs(yp - tsbZeroY);
          const top = Math.min(yp, tsbZeroY);
          const fill = p.tsb >= 0 ? "var(--c-cool)" : "var(--c-warn)";
          return (
            <rect key={`t${i}`} x={x(i) - 1} y={top} width="2" height={Math.max(0.5, h)} fill={fill} fillOpacity="0.5"/>
          );
        })}

        {/* date ticks */}
        {[0, Math.floor(N/2), N - 1].map(i => (
          <text key={`d${i}`} x={x(i)} y={VB_H - 6} textAnchor="middle" fontSize="9" fill="var(--c-mute)" fontFamily="var(--f-mono)">
            {pmc[i].date.slice(5)}
          </text>
        ))}
      </svg>

      <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10, color: "var(--c-mute)", fontFamily: "var(--f-mono)", flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--c-accent)", verticalAlign: "middle", marginRight: 5 }}/>Fitness</span>
        <span><span style={{ display: "inline-block", width: 14, height: 0, borderTop: "1.5px dashed var(--c-hot)", verticalAlign: "middle", marginRight: 5 }}/>Fatigue</span>
        <span><span style={{ display: "inline-block", width: 6, height: 8, background: "var(--c-cool)", opacity: 0.5, verticalAlign: "middle", marginRight: 5 }}/>Fresh</span>
        <span><span style={{ display: "inline-block", width: 6, height: 8, background: "var(--c-warn)", opacity: 0.5, verticalAlign: "middle", marginRight: 5 }}/>Tired</span>
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
// Differentiation rule (matches styles.js TYPE_STYLE):
//   SPEED — solid deep red, full strength
//   TEMPO — solid bright orange
//   EASY  — half-opacity terracotta (most days are easy; quiet by default)
export const TYPE_META = {
  EASY:       { dot: "rgba(181, 72, 42, 0.5)", label: "Easy" },
  RECOVERY:   { dot: "var(--c-cool)",          label: "Recovery" },
  LONG:       { dot: "#7B5A8C",                label: "Long" },
  "LONG RUN": { dot: "#7B5A8C",                label: "Long" },
  TEMPO:      { dot: "#D97706",                label: "Tempo" },
  SPEED:      { dot: "#C8341B",                label: "Speed" },
  RACE:       { dot: "var(--c-ink)",           label: "Race" },
  "RACE DAY": { dot: "var(--c-ink)",           label: "Race" },
  REST:       { dot: "var(--c-mute)",          label: "Rest" },
  STRENGTH:   { dot: "#5A6B7B",                label: "Strength" },
  HYROX:      { dot: "#C79541",                label: "Hyrox" },
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
            {(() => {
              // When the run actually happened (local time on the athlete's
              // device), not when it was imported. Falls back to UTC start_date
              // if local isn't present.
              const raw = data.start_date_local || data.start_date;
              if (!raw) return null;
              const d = new Date(raw);
              if (isNaN(d)) return null;
              const dateStr = d.toLocaleDateString(undefined, { weekday:"short", day:"numeric", month:"short" });
              const timeStr = d.toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
              return (
                <div className="t-mono" style={{ fontSize:10, color:"var(--c-mute)", letterSpacing:"0.1em", marginTop:2, textTransform:"uppercase" }}>
                  {dateStr} · {timeStr}
                </div>
              );
            })()}
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

  // While fetching detail for a pre-selected ID, show a slim loading row.
  if (detailLoading) {
    return (
      <div style={{ marginBottom:14, padding:"12px 14px", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, display:"flex", alignItems:"center", gap:8 }}>
        <span className="t-mono" style={{ fontSize:11, letterSpacing:"0.16em", color:C.green }}>STRAVA</span>
        <span style={{ fontSize:13, color:C.mid, fontStyle:"italic" }}>Importing run…</span>
      </div>
    );
  }

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
        </div>
      )}
    </div>
  );
}
