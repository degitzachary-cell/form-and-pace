// Canonical workout library — a library of named, threshold-relative
// workouts that scale to each athlete's current fitness. Paces use Daniels-
// style zone tokens which expand to absolute paces via expandZonePace()
// when applied. Each entry mirrors the workout_templates schema (name,
// type, tag, description, pace, steps) plus a `seedKey` for dedup.
//
// Zone tokens (multipliers of threshold pace SPEED, where T = threshold):
//   E — Easy           ~78–85% T-speed     (1.18–1.28× T-time)
//   M — Marathon       ~88–92% T-speed     (1.09–1.13× T-time)
//   T — Threshold      ~98–102% T-speed    (0.98–1.02× T-time)
//   I — Interval/VO2  ~106–110% T-speed   (0.91–0.94× T-time, ~5K pace)
//   R — Repetition    ~112–117% T-speed   (0.85–0.89× T-time, ~mile pace)
//
// Token forms:
//   "E"             → easy pace range
//   "T"             → threshold pace range
//   "I"             → VO2 interval pace range
//   "M"             → marathon pace range
//   "R"             → repetition pace range
// expandZonePace() resolves these against the athlete's threshold.

export const WORKOUT_SEEDS = [
  // ── EASY / RECOVERY ───────────────────────────────────────────────
  { seedKey: "easy-30", name: "Easy 30", type: "EASY", tag: "easy",
    description: "Conversational. Nose-breathing should be easy throughout.",
    pace: "E", terrain: "Flat",
    steps: [{ kind: "steady", duration_min: 30, pace: "E", note: "Conversational" }] },

  { seedKey: "easy-45", name: "Easy 45", type: "EASY", tag: "easy",
    description: "Standard aerobic shake-out.",
    pace: "E", terrain: "Flat",
    steps: [{ kind: "steady", duration_min: 45, pace: "E" }] },

  { seedKey: "easy-60", name: "Easy 60", type: "EASY", tag: "easy",
    description: "Build aerobic capacity.",
    pace: "E", terrain: "Flat",
    steps: [{ kind: "steady", duration_min: 60, pace: "E" }] },

  { seedKey: "easy-75-strides", name: "Easy 60 + 6×20s strides", type: "EASY", tag: "easy",
    description: "Add neuromuscular zip after the easy block.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 60, pace: "E" },
      { kind: "interval", reps: 6, work: { duration_s: 20, pace: "R" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
    ] },

  { seedKey: "recovery-30", name: "Recovery 30", type: "RECOVERY", tag: "easy",
    description: "Very easy. If in doubt, slower.",
    pace: "E", terrain: "Flat",
    steps: [{ kind: "steady", duration_min: 30, pace: "E", note: "Very easy" }] },

  { seedKey: "recovery-40-strides", name: "Recovery 40 + strides", type: "RECOVERY", tag: "easy",
    description: "Easy with neuromuscular maintenance.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 40, pace: "E", note: "Very easy" },
      { kind: "interval", reps: 4, work: { duration_s: 20, pace: "R" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
    ] },

  // ── LONG RUNS ─────────────────────────────────────────────────────
  { seedKey: "long-90", name: "Long 90", type: "LONG RUN", tag: "easy",
    description: "Steady aerobic long run.",
    pace: "E", terrain: "Mixed",
    steps: [{ kind: "steady", duration_min: 90, pace: "E" }] },

  { seedKey: "long-120", name: "Long 120", type: "LONG RUN", tag: "easy",
    description: "Standard 2-hour long run.",
    pace: "E", terrain: "Mixed",
    steps: [{ kind: "steady", duration_min: 120, pace: "E" }] },

  { seedKey: "long-150", name: "Long 150", type: "LONG RUN", tag: "easy",
    description: "Marathon-prep long run.",
    pace: "E", terrain: "Mixed",
    steps: [{ kind: "steady", duration_min: 150, pace: "E" }] },

  { seedKey: "long-mp-finish", name: "Long with MP finish", type: "LONG RUN", tag: "easy",
    description: "Easy block with marathon-pace push at the end.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 80, pace: "E" },
      { kind: "steady", duration_min: 20, pace: "M", note: "Marathon pace" },
    ] },

  { seedKey: "long-progression", name: "Long progression", type: "LONG RUN", tag: "easy",
    description: "Build pace over the run — finish strongest.",
    pace: "E-M", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 30, pace: "E" },
      { kind: "steady", duration_min: 30, pace: "E" },
      { kind: "steady", duration_min: 20, pace: "M" },
      { kind: "steady", duration_min: 10, pace: "T" },
    ] },

  { seedKey: "long-tempo-block", name: "Long with tempo block", type: "LONG RUN", tag: "tempo",
    description: "Long run with a sustained tempo in the middle.",
    pace: "E-T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 20, pace: "E" },
      { kind: "steady", duration_min: 25, pace: "T", note: "Comfortably hard" },
      { kind: "cooldown", duration_min: 35, pace: "E" },
    ] },

  // ── TEMPO / THRESHOLD ─────────────────────────────────────────────
  { seedKey: "tempo-20", name: "Tempo 20", type: "TEMPO", tag: "tempo",
    description: "Classic 20-min tempo. Comfortably hard.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 20, pace: "T" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "tempo-30", name: "Daniels T-30", type: "TEMPO", tag: "tempo",
    description: "30 min straight at threshold — the classic Daniels session.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 30, pace: "T", note: "Lock in threshold" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "tempo-40", name: "Tempo 40", type: "TEMPO", tag: "tempo",
    description: "Extended threshold work for marathoners.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 40, pace: "T" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "cruise-4x5", name: "Cruise 4×5min", type: "TEMPO", tag: "tempo",
    description: "Threshold cruise intervals with short jog recovery.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 4, work: { duration_s: 300, pace: "T" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "cruise-6x1k", name: "Cruise 6×1km", type: "TEMPO", tag: "tempo",
    description: "Threshold km repeats — a touch faster than tempo.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 6, work: { distance_m: 1000, pace: "T" }, recovery: { duration_s: 90, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "cruise-3x2k", name: "Cruise 3×2km", type: "TEMPO", tag: "tempo",
    description: "Longer threshold reps for half-marathon prep.",
    pace: "T", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 3, work: { distance_m: 2000, pace: "T" }, recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "tempo-hill", name: "Tempo on hills", type: "TEMPO", tag: "tempo",
    description: "20 min tempo on rolling hills — strength + threshold.",
    pace: "T", terrain: "Hills",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 20, pace: "T", note: "Hold effort, not pace, on hills" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── VO2 / INTERVALS ───────────────────────────────────────────────
  { seedKey: "bakken-8x400", name: "Bakken 8×400", type: "SPEED", tag: "speed",
    description: "Classic Norwegian VO2 — 8×400m at 5K pace, short rest.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 8, work: { distance_m: 400, pace: "I" }, recovery: { duration_s: 90, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "5x800", name: "5×800m", type: "SPEED", tag: "speed",
    description: "VO2 800s — solid all-rounder.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 5, work: { distance_m: 800, pace: "I" }, recovery: { duration_s: 180, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "yasso-10x800", name: "Yasso 10×800", type: "SPEED", tag: "speed",
    description: "Marathon predictor — 10×800 at marathon goal pace, equal rest.",
    pace: "M", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 10, work: { distance_m: 800, pace: "M" }, recovery: { duration_s: 240, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "6x1000", name: "6×1000m", type: "SPEED", tag: "speed",
    description: "Solid VO2 km repeats.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 6, work: { distance_m: 1000, pace: "I" }, recovery: { duration_s: 180, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "4x1mile", name: "4×1 mile", type: "SPEED", tag: "speed",
    description: "Mile repeats at VO2 — bread and butter for 5K-10K prep.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 4, work: { distance_m: 1609, pace: "I" }, recovery: { duration_s: 240, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "ladder-400-800-1200-800-400", name: "Ladder 400-800-1200-800-400", type: "SPEED", tag: "speed",
    description: "Pyramidal VO2 work — variety + race-pace exposure.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 1, work: { distance_m: 400, pace: "I" },  recovery: { duration_s: 90, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { distance_m: 800, pace: "I" },  recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { distance_m: 1200, pace: "I" }, recovery: { duration_s: 180, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { distance_m: 800, pace: "I" },  recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { distance_m: 400, pace: "I" },  recovery: { duration_s: 90,  pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "12x400-r", name: "12×400 R-pace", type: "SPEED", tag: "speed",
    description: "Repetition speed — sharp and fast.",
    pace: "R", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 12, work: { distance_m: 400, pace: "R" }, recovery: { duration_s: 200, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "8x200", name: "8×200m", type: "SPEED", tag: "speed",
    description: "Short, fast turnover. Classic R-pace primer.",
    pace: "R", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 8, work: { distance_m: 200, pace: "R" }, recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── HILLS ─────────────────────────────────────────────────────────
  { seedKey: "hills-10x60s", name: "Hills 10×60s", type: "SPEED", tag: "speed",
    description: "Steep hill repeats — 60s up hard, jog down.",
    pace: "I", terrain: "Hills",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 10, work: { duration_s: 60, pace: "I", note: "Strong, not sprinting" }, recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "hills-6x90s", name: "Hills 6×90s", type: "SPEED", tag: "speed",
    description: "Longer hill efforts at threshold-plus.",
    pace: "T", terrain: "Hills",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 6, work: { duration_s: 90, pace: "T" }, recovery: { duration_s: 150, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "hills-strides", name: "Hill strides 8×30s", type: "EASY", tag: "easy",
    description: "Short, sharp uphill strides — neuromuscular without taxing.",
    pace: "R", terrain: "Hills",
    steps: [
      { kind: "warmup", duration_min: 30, pace: "E" },
      { kind: "interval", reps: 8, work: { duration_s: 30, pace: "R" }, recovery: { duration_s: 90, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── MARATHON / HALF-SPECIFIC ──────────────────────────────────────
  { seedKey: "mp-block", name: "MP block 12km", type: "TEMPO", tag: "tempo",
    description: "Sustained marathon pace — race-day rehearsal.",
    pace: "M", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 0, distance_km: 12, pace: "M" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "mp-3x4k", name: "MP 3×4km", type: "TEMPO", tag: "tempo",
    description: "Marathon-pace blocks with brief recoveries.",
    pace: "M", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 3, work: { distance_m: 4000, pace: "M" }, recovery: { duration_s: 120, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "hmp-6x1mi", name: "HMP 6×1 mile", type: "TEMPO", tag: "tempo",
    description: "Half-marathon pace mile reps.",
    pace: "T-M", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 6, work: { distance_m: 1609, pace: "T-M" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── HYBRID / MIXED ────────────────────────────────────────────────
  { seedKey: "hybrid-tempo-vo2", name: "Tempo into 5×400", type: "TEMPO", tag: "tempo",
    description: "Threshold then sharpen with short VO2 reps.",
    pace: "T-I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", duration_min: 15, pace: "T" },
      { kind: "interval", reps: 5, work: { distance_m: 400, pace: "I" }, recovery: { duration_s: 90, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "alt-2x6x30s", name: "Alternations 2×6×30s", type: "SPEED", tag: "speed",
    description: "Alternations: 30s on, 30s float — race-pace simulation.",
    pace: "I", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 6, work: { duration_s: 30, pace: "I" }, recovery: { duration_s: 30, pace: "M", style: "float" } },
      { kind: "steady", duration_min: 5, pace: "E", note: "Recovery between sets" },
      { kind: "interval", reps: 6, work: { duration_s: 30, pace: "I" }, recovery: { duration_s: 30, pace: "M", style: "float" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── RACE PREP ─────────────────────────────────────────────────────
  { seedKey: "race-prep-shakeout", name: "Race-day shakeout", type: "RECOVERY", tag: "easy",
    description: "Day before a race — wake the legs without taxing them.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 4, work: { duration_s: 20, pace: "R" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
    ] },

  { seedKey: "race-prep-tempo-2-2-2", name: "Pre-race 2-2-2", type: "TEMPO", tag: "tempo",
    description: "Sharpener 4 days out — short tempo blocks.",
    pace: "T-I", terrain: "Flat",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 1, work: { duration_s: 120, pace: "T" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { duration_s: 120, pace: "T" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "interval", reps: 1, work: { duration_s: 120, pace: "I" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── BASE-BUILDING ─────────────────────────────────────────────────
  { seedKey: "fartlek-30", name: "Fartlek 30", type: "TEMPO", tag: "tempo",
    description: "Unstructured pickups — feel-based fartlek.",
    pace: "T-I", terrain: "Mixed",
    steps: [
      { kind: "warmup", duration_min: 10, pace: "E" },
      { kind: "steady", duration_min: 30, pace: "T-I", note: "Surge when you feel like it; recover easy" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "progressive-30", name: "Progressive 30", type: "EASY", tag: "easy",
    description: "Build pace through the run — easy → marathon → tempo.",
    pace: "E-T", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 10, pace: "E" },
      { kind: "steady", duration_min: 10, pace: "M" },
      { kind: "steady", duration_min: 10, pace: "T" },
    ] },

  { seedKey: "out-back", name: "Out-and-back even split", type: "EASY", tag: "easy",
    description: "First half easy, second half marginal pickup. Test pacing.",
    pace: "E-M", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 25, pace: "E" },
      { kind: "steady", duration_min: 25, pace: "M", note: "Even split target" },
    ] },

  { seedKey: "easy-strides-friday", name: "Pre-workout primer", type: "EASY", tag: "easy",
    description: "Day before quality work — flush + 6 strides.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 30, pace: "E" },
      { kind: "interval", reps: 6, work: { duration_s: 15, pace: "R" }, recovery: { duration_s: 75, pace: "E", style: "jog" } },
    ] },

  // ── TRACK CLASSICS ────────────────────────────────────────────────
  { seedKey: "michigans", name: "Michigans", type: "TEMPO", tag: "tempo",
    description: "Alternating mile + 800m — track + tempo mix.",
    pace: "T-I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady",   distance_km: 1.609, pace: "T" },
      { kind: "interval", reps: 1, work: { distance_m: 800, pace: "I" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "steady",   distance_km: 1.609, pace: "T" },
      { kind: "interval", reps: 1, work: { distance_m: 800, pace: "I" }, recovery: { duration_s: 60, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "kenyan-2x1mi", name: "Kenyan 2×1mi @ 5K", type: "SPEED", tag: "speed",
    description: "Short VO2 session — 2 mile reps with full recovery.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "interval", reps: 2, work: { distance_m: 1609, pace: "I" }, recovery: { duration_s: 300, pace: "E", style: "jog" } },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  // ── CROSS / FILLER ────────────────────────────────────────────────
  { seedKey: "double-am-pm", name: "Easy double 30+30", type: "EASY", tag: "easy",
    description: "Two short easy runs in a day — more volume, less stress.",
    pace: "E", terrain: "Flat",
    steps: [
      { kind: "steady", duration_min: 30, pace: "E", note: "AM session" },
      { kind: "steady", duration_min: 30, pace: "E", note: "PM session" },
    ] },

  { seedKey: "rest", name: "Rest", type: "REST", tag: "rest",
    description: "Full rest. No run today.",
    pace: "", terrain: "",
    steps: [] },

  { seedKey: "test-3k", name: "3K time trial", type: "RACE", tag: "tempo",
    description: "All-out 3K to set or refresh threshold pace.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", distance_km: 3, pace: "I", note: "All-out test" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },

  { seedKey: "test-5k-tt", name: "5K time trial", type: "RACE", tag: "tempo",
    description: "Solo 5K test — calibrates VDOT/threshold.",
    pace: "I", terrain: "Track",
    steps: [
      { kind: "warmup", duration_min: 15, pace: "E" },
      { kind: "steady", distance_km: 5, pace: "I", note: "Race effort" },
      { kind: "cooldown", duration_min: 10, pace: "E" },
    ] },
];
