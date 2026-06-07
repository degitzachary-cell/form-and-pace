import { describe, it, expect } from "vitest";
import {
  dailyLoadFromActivitiesAndLogs, effortDrift, readinessScore, hooperToday,
} from "./wellness.js";

describe("effortDrift", () => {
  const session = { type: "EASY", rpe_target: "3-4" };
  it("flags runs that felt much harder than target", () => {
    expect(effortDrift({ session, log: { analysis: { wellness: { rpe: 7 } } } })).toBe("over");
  });
  it("accepts within-tolerance RPE", () => {
    expect(effortDrift({ session, log: { analysis: { wellness: { rpe: 4 } } } })).toBe("ok");
  });
  it("flags much-easier-than-target", () => {
    expect(effortDrift({ session, log: { analysis: { wellness: { rpe: 1 } } } })).toBe("under");
  });
  it("returns null for REST or missing RPE", () => {
    expect(effortDrift({ session: { type: "REST" }, log: { analysis: { wellness: { rpe: 5 } } } })).toBeNull();
    expect(effortDrift({ session, log: { analysis: {} } })).toBeNull();
  });
});

describe("readinessScore quorum", () => {
  it("stays neutral with fewer than two confident signals", () => {
    const r = readinessScore({ pmcTail: null, hooper: { confidence: "low" }, drift: { confidence: "low" } });
    expect(r.neutral).toBe(true);
    expect(r.verdict).toBe("go");
  });
  it("backs off when two back-off signals stack", () => {
    const r = readinessScore({
      pmcTail: { ctl: 50, atl: 80 },                       // ACWR 1.6 → spike
      hooper: { confidence: "ok", level: "alarm", z: 2 },  // wellness alarm
      drift: { confidence: "low" },
    });
    expect(r.verdict).toBe("back-off");
    expect(r.severity).toBe(2);
  });
  it("cautions when two caution signals stack", () => {
    const r = readinessScore({
      pmcTail: { ctl: 50, atl: 70 },                          // ACWR 1.4 → high
      hooper: { confidence: "ok", level: "elevated", z: 1 },  // wellness elevated
      drift: { confidence: "low" },
    });
    expect(r.verdict).toBe("caution");
    expect(r.severity).toBe(1);
  });
});

describe("hooperToday", () => {
  it("is low-confidence when nothing logged today", () => {
    const r = hooperToday({ logs: {}, asOfDate: "2024-01-10" });
    expect(r.confidence).toBe("low");
  });
});

describe("dailyLoadFromActivitiesAndLogs", () => {
  it("uses a stored rTSS on a run activity", () => {
    const out = dailyLoadFromActivitiesAndLogs({
      activities: [{ athlete_email: "a", activity_date: "2024-01-01", rtss: 80, activity_type: "Run", distance_km: "10", duration_seconds: 3000 }],
      logs: {},
      profile: {},
    });
    expect(out).toContainEqual({ date: "2024-01-01", rtss: 80 });
  });

  it("folds in sRPE load for a non-run session with logged RPE", () => {
    const out = dailyLoadFromActivitiesAndLogs({
      activities: [{ athlete_email: "a", activity_date: "2024-01-02", activity_type: "Strength", duration_seconds: 3600 }],
      logs: { s1: { id: "s1", athlete_email: "a", analysis: { actual_date: "2024-01-02", wellness: { rpe: 5 } } } },
      profile: {},
    });
    // sRPE = 5 × 60 min = 300; default factor 0.20 → 60
    expect(out).toContainEqual({ date: "2024-01-02", rtss: 60 });
  });

  it("includes a manual log with no matching activity", () => {
    const out = dailyLoadFromActivitiesAndLogs({
      activities: [],
      logs: { s1: { id: "s1", athlete_email: "a", analysis: { actual_date: "2024-01-03", duration_min: 30, wellness: { rpe: 6 } } } },
      profile: {},
    });
    // sRPE = 6 × 30 = 180 × 0.20 = 36
    expect(out).toContainEqual({ date: "2024-01-03", rtss: 36 });
  });
});
