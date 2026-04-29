// ─── DESIGN TOKENS — "Bone" theme (editorial / soft & human) ─────────────────
// Palette + type system from the redesign. Old export names (C, S, TYPE_STYLE,
// typeStyle, COMPLY_*, TAG_*) are preserved so existing screens keep working
// without a refactor; their values just shift to the new design language.
export const C = {
  // legacy keys — repointed to new "bone" palette
  cream:     "#F4EFE6",   // bg
  white:     "#FBF8F1",   // paper
  navy:      "#1A1814",   // ink
  crimson:   "#B5482A",   // hot (terracotta) — used sparingly
  green:     "#5C6B3D",   // accent (dusty olive — calm "go" signal)
  amber:     "#A87B2E",   // warn
  mid:       "#8C857A",   // mute
  rule:      "#D9D0BE",
  lightRule: "#E8E1D2",

  // new tokens (preferred)
  bg:        "#F4EFE6",
  bgDeep:    "#EDE6D9",
  paper:     "#FBF8F1",
  ink:       "#1A1814",
  inkSoft:   "#4A4540",
  mute:      "#8C857A",
  ruleSoft:  "#E8E1D2",
  accent:    "#5C6B3D",
  accentInk: "#FBF8F1",
  hot:       "#B5482A",
  hotInk:    "#FBF8F1",
  cool:      "#3F5A6B",
  warn:      "#A87B2E",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const DISPLAY = "'Newsreader', Georgia, serif";
const BODY    = "'Inter Tight', -apple-system, system-ui, sans-serif";
const MONO    = "'JetBrains Mono', ui-monospace, monospace";

export const S = {
  displayFont: DISPLAY,
  bodyFont:    BODY,
  monoFont:    MONO,
  page:       { minHeight:"100vh", background:C.bg, fontFamily:BODY, color:C.ink, position:"relative", WebkitFontSmoothing:"antialiased" },
  grain:      { display:"none" },
  card:       { background:C.paper, border:`1px solid ${C.rule}`, borderRadius:2, padding:"16px 18px" },
  statBox:    { flex:1, background:C.paper, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 10px", textAlign:"center" },
  textarea:   { width:"100%", background:C.paper, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 16px", color:C.ink, fontSize:16, lineHeight:1.55, resize:"none", minHeight:130, boxSizing:"border-box", fontFamily:DISPLAY, marginBottom:14, display:"block", outline:"none" },
  input:      { width:"100%", background:C.paper, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 14px", color:C.ink, fontSize:15, boxSizing:"border-box", fontFamily:BODY, display:"block", outline:"none" },
  primaryBtn: (c, dis) => ({ width:"100%", background:dis?C.lightRule:(c||C.ink), color:dis?C.mute:C.paper, border:"none", borderRadius:2, padding:"16px", fontSize:12, fontWeight:600, cursor:dis?"not-allowed":"pointer", letterSpacing:"0.16em", textTransform:"uppercase", display:"block", fontFamily:BODY }),
  ghostBtn:   { width:"100%", background:"transparent", border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px", color:C.ink, fontSize:12, cursor:"pointer", marginTop:8, fontFamily:BODY, letterSpacing:"0.14em", textTransform:"uppercase", display:"block", textAlign:"center" },
  signOutBtn: { background:"transparent", border:`1px solid ${C.rule}`, borderRadius:2, padding:"5px 12px", color:C.inkSoft, fontSize:11, cursor:"pointer", letterSpacing:"0.12em", fontFamily:BODY, textTransform:"uppercase" },
};

// Soft tag tints used in light contexts (kept for back-compat).
export const TAG_STYLE = {
  easy:  { bg:"#EAEFD9", accent:C.accent, border:"#CFD9B0" },
  speed: { bg:"#F2D9CF", accent:C.hot,    border:"#E2BAA8" },
  tempo: { bg:"#F0E2C5", accent:C.warn,   border:"#E0CCA0" },
};

// Per-TYPE styling. Editorial palette — desaturated dots + soft tints.
//   accent / dot — solid color used for the dot + label
//   bg           — soft tint behind cards (when logged)
//   border       — card border tint
export const TYPE_STYLE = {
  EASY:       { accent:C.accent,  dot:C.accent,  bg:"#EAEFD9", border:"#CFD9B0" },
  RECOVERY:   { accent:C.cool,    dot:C.cool,    bg:"#DDE6EC", border:"#B7C9D5" },
  "LONG RUN": { accent:"#7B5A8C", dot:"#7B5A8C", bg:"#E9DEF0", border:"#C9B8D5" },
  TEMPO:      { accent:C.warn,    dot:C.warn,    bg:"#F0E2C5", border:"#E0CCA0" },
  SPEED:      { accent:C.hot,     dot:C.hot,     bg:"#F2D9CF", border:"#E2BAA8" },
  HYROX:      { accent:"#C79541", dot:"#C79541", bg:"#FFF4D4", border:"#1C1D22",
                pattern:"linear-gradient(135deg, #F5C542 0 50%, #1C1D22 50% 100%)" },
  "RACE DAY": { accent:C.ink,     dot:C.ink,     bg:"#FAFAFA", border:C.ink,
                pattern:"conic-gradient(#1C1D22 25%, #FFF 25% 50%, #1C1D22 50% 75%, #FFF 75%) 0 0 / 12px 12px" },
  REST:       { accent:C.mute,    dot:C.mute,    bg:"#EDE6D9", border:C.rule },
  STRENGTH:   { accent:"#5A6B7B", dot:"#5A6B7B", bg:"#DEE5EC", border:"#B7C2CD" },
};

// Look up TYPE_STYLE for any type string. Falls back to EASY if unknown,
// and case-insensitive.
export function typeStyle(type) {
  if (!type) return TYPE_STYLE.EASY;
  const key = String(type).toUpperCase().trim();
  return TYPE_STYLE[key] || TYPE_STYLE.EASY;
}

export const COMPLY_COLOR = { completed:C.accent, missed:C.hot, partial:C.warn, pending:C.mute };
export const COMPLY_LABEL = { completed:"✓ Done", missed:"✗ Missed", partial:"~ Partial", pending:"Pending" };
export const TAG_EMOJI    = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
