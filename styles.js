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
export const COMPLY_COLOR = { completed:"#2a6e27", missed:"#8b1c1c", partial:"#8b6914", pending:"#9a8a7a" };
export const COMPLY_LABEL = { completed:"✓ Done", missed:"✗ Missed", partial:"~ Partial", pending:"Pending" };
export const TAG_EMOJI    = { speed:"⚡", tempo:"🎯", easy:"🏃", long:"🏃" };
