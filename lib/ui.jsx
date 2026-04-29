// Shared editorial atoms — used as we rebuild screens to the new design.
// Tokens come from CSS vars defined in index.html / styles.js.
import { C } from "../styles.js";

export const Seal = ({ size = 18, color }) => (
  <span className="fp-seal" style={{ fontSize: size, color: color || "var(--c-ink)" }}>✻</span>
);

export const Eyebrow = ({ children, style }) => (
  <div className="t-eyebrow" style={style}>{children}</div>
);

export const Rule = ({ soft, style }) => (
  <div className={soft ? "fp-rule-soft" : "fp-rule"} style={style} />
);

// Mono numeric — tabular figures, used for pace, distance, splits.
export const Num = ({ children, size = 14, weight = 500, color, style }) => (
  <span className="t-mono" style={{ fontSize: size, fontWeight: weight, color: color || "var(--c-ink)", ...style }}>{children}</span>
);

// Big editorial display number.
export const BigNum = ({ children, size = 96, color, italic, style }) => (
  <span className={italic ? "t-display-italic" : "t-display"} style={{ fontSize: size, color: color || "var(--c-ink)", fontWeight: 400, ...style }}>{children}</span>
);

export const Stat = ({ label, value, mono = true, color }) => (
  <div>
    <Eyebrow style={{ marginBottom: 6 }}>{label}</Eyebrow>
    {mono
      ? <Num size={18} weight={500} color={color}>{value}</Num>
      : <span style={{ fontSize: 18, color: color || "var(--c-ink)" }}>{value}</span>}
  </div>
);

// "01 / 04 · LABEL" with optional action on the right.
export const SectionHead = ({ index, total, label, action, style }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 12px", borderBottom: "1px solid var(--c-rule)", ...style }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
      {(index || total) ? (
        <Num size={11} color="var(--c-mute)" style={{ letterSpacing: "0.1em" }}>
          {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </Num>
      ) : null}
      <Eyebrow style={{ color: "var(--c-ink)" }}>{label}</Eyebrow>
    </div>
    {action}
  </div>
);

// Workout-type meta — desaturated dot color + nice label.
export const TYPE_COLOR = {
  EASY:       { dot: "var(--c-accent)", label: "Easy" },
  RECOVERY:   { dot: "var(--c-cool)",   label: "Recovery" },
  "LONG RUN": { dot: "#7B5A8C",         label: "Long" },
  LONG:       { dot: "#7B5A8C",         label: "Long" },
  TEMPO:      { dot: "var(--c-warn)",   label: "Tempo" },
  SPEED:      { dot: "var(--c-hot)",    label: "Speed" },
  RACE:       { dot: "var(--c-ink)",    label: "Race" },
  "RACE DAY": { dot: "var(--c-ink)",    label: "Race" },
  REST:       { dot: "var(--c-mute)",   label: "Rest" },
  STRENGTH:   { dot: "#5A6B7B",         label: "Strength" },
  HYROX:      { dot: "#C79541",         label: "Hyrox" },
};

export function typeMeta(type) {
  if (!type) return TYPE_COLOR.EASY;
  const k = String(type).toUpperCase().trim();
  return TYPE_COLOR[k] || TYPE_COLOR[k.split(" ")[0]] || TYPE_COLOR.EASY;
}

// Tonal back arrow — keeps it editorial (no chrome).
export const BackArrow = ({ onClick, style }) => (
  <button
    onClick={onClick}
    style={{
      background: "none", border: "none", cursor: "pointer",
      color: "var(--c-inkSoft)", fontSize: 22, padding: 0, lineHeight: 1,
      fontFamily: "var(--f-display)", ...style,
    }}
    aria-label="Back"
  >←</button>
);

// Small serif tick used for completed states.
export const Tick = ({ size = 12, color = "var(--c-accent)" }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <path d="M2 6.5 L5 9.5 L10 3" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const PageBG = ({ children, style }) => (
  <div style={{ background: "var(--c-bg)", minHeight: "100%", ...style }}>{children}</div>
);

// Re-export palette for convenience.
export { C };
