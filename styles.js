// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
export const C = {
  cream:     "#f5ede2",
  white:     "#fffdf8",
  navy:      "#0c1b2e",
  crimson:   "#8b1c1c",
  green:     "#2a6e27",
  amber:     "#8b6914",
  mid:       "#7a6a5a",
  rule:      "#d8cabb",
  lightRule: "#ece4d6",
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
export const S = {
  displayFont: "'Playfair Display', Georgia, serif",
  bodyFont:    "'EB Garamond', Georgia, serif",
  monoFont:    "'Courier New', Courier, monospace",
  page:       { minHeight:"100vh", background:C.cream, fontFamily:"'EB Garamond', Georgia, serif", color:C.navy, position:"relative" },
  grain:      { display:"none" },
  card:       { background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 16px" },
  statBox:    { flex:1, background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 10px", textAlign:"center" },
  textarea:   { width:"100%", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px 16px", color:C.navy, fontSize:15, lineHeight:1.8, resize:"none", minHeight:130, boxSizing:"border-box", fontFamily:"'EB Garamond', Georgia, serif", marginBottom:14, display:"block" },
  input:      { width:"100%", background:C.white, border:`1px solid ${C.rule}`, borderRadius:2, padding:"12px 14px", color:C.navy, fontSize:15, boxSizing:"border-box", fontFamily:"'EB Garamond', Georgia, serif", display:"block" },
  primaryBtn: (c, dis) => ({ width:"100%", background:dis?C.lightRule:c, color:dis?C.mid:"#fffdf8", border:"none", borderRadius:2, padding:"16px", fontSize:13, fontWeight:600, cursor:dis?"not-allowed":"pointer", letterSpacing:2, textTransform:"uppercase", display:"block", fontFamily:"'EB Garamond', Georgia, serif" }),
  ghostBtn:   { width:"100%", background:"none", border:`1px solid ${C.rule}`, borderRadius:2, padding:"14px", color:C.mid, fontSize:13, cursor:"pointer", marginTop:8, fontFamily:"'EB Garamond', Georgia, serif", letterSpacing:1, display:"block", textAlign:"center" },
  signOutBtn: { background:"none", border:`1px solid ${C.rule}`, borderRadius:2, padding:"5px 12px", color:C.mid, fontSize:11, cursor:"pointer", letterSpacing:1, fontFamily:"'EB Garamond', Georgia, serif" },
};

export const TAG_STYLE = {
  easy:  { bg:"#e6f0e3", accent:"#2a5c27", border:"#b8d4b4" },
  speed: { bg:"#e2eaf5", accent:"#14365f", border:"#b0c8e8" },
  tempo: { bg:"#f5e4e4", accent:"#7a1a1a", border:"#e0b8b8" },
};

// Per-TYPE styling. Used everywhere a workout is rendered. Each entry has:
//   accent  — solid colour for labels/borders
//   bg      — soft tint for card background (when logged)
//   pattern — optional CSS background for special types (Hyrox, Race Day)
export const TYPE_STYLE = {
  EASY:       { accent:"#2a6e27", bg:"#e6f0e3", border:"#b8d4b4" },
  RECOVERY:   { accent:"#3a7ca8", bg:"#e3eef5", border:"#b8d0e0" },
  "LONG RUN": { accent:"#5b3a7a", bg:"#ece2f0", border:"#cdb8d8" },
  TEMPO:      { accent:"#c2691f", bg:"#f5e9d8", border:"#e6c8a0" },
  SPEED:      { accent:"#8a2a2a", bg:"#f5e0e0", border:"#e0b8b8" },
  HYROX:      { accent:"#c79541", bg:"#fff4d4", border:"#1c1d22",
                pattern:"linear-gradient(135deg, #f5c542 0 50%, #1c1d22 50% 100%)" },
  "RACE DAY": { accent:"#1c1d22", bg:"#fafafa", border:"#1c1d22",
                pattern:"conic-gradient(#1c1d22 25%, #fff 25% 50%, #1c1d22 50% 75%, #fff 75%) 0 0 / 12px 12px" },
  REST:       { accent:"#d63384", bg:"#fde6f0", border:"#f0b8d0" },
};

// Look up TYPE_STYLE for any type string. Falls back to EASY if unknown,
// and case-insensitive.
export function typeStyle(type) {
  if (!type) return TYPE_STYLE.EASY;
  const key = String(type).toUpperCase().trim();
  return TYPE_STYLE[key] || TYPE_STYLE.EASY;
}

export const COMPLY_COLOR = { completed:"#2a6e27", missed:"#8b1c1c", partial:"#8b6914", pending:"#9a8a7a" };
export const COMPLY_LABEL = { completed:"✓ Done", missed:"✗ Missed", partial:"~ Partial", pending:"Pending" };
export const TAG_EMOJI    = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
