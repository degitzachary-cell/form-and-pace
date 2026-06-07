import { describe, it, expect } from "vitest";
import { matchActivitiesToSessions, linkedActsBySession } from "./sessionMatching.js";

describe("matchActivitiesToSessions", () => {
  it("links a single run session to a single run activity", () => {
    const r = matchActivitiesToSessions({
      sessions: [{ id: "s1", type: "EASY", distance_km: 10 }],
      activities: [{ id: "a1", activity_type: "Run", distance_km: "10" }],
      logs: {},
    });
    expect(r.bySessionId.get("s1").id).toBe("a1");
    expect(r.unmatchedActs).toHaveLength(0);
  });

  it("routes by sport on a double day (run↔run, strength↔strength)", () => {
    const r = matchActivitiesToSessions({
      sessions: [{ id: "s1", type: "EASY", distance_km: 10 }, { id: "s2", type: "STRENGTH" }],
      activities: [{ id: "a1", activity_type: "Run", distance_km: "10" }, { id: "a2", activity_type: "WeightTraining" }],
      logs: {},
    });
    expect(r.bySessionId.get("s1").id).toBe("a1");
    expect(r.bySessionId.get("s2").id).toBe("a2");
  });

  it("honours an explicit manual link over a better score", () => {
    const r = matchActivitiesToSessions({
      sessions: [{ id: "s1", type: "EASY", distance_km: 10 }],
      activities: [{ id: "a1", activity_type: "Run", distance_km: "10" }, { id: "a2", activity_type: "Run", distance_km: "21" }],
      logs: { s1: { analysis: { linked_activity_id: "a2" } } },
    });
    expect(r.bySessionId.get("s1").id).toBe("a2");
  });

  it("vetoes a sport mismatch and leaves the activity unmatched", () => {
    const r = matchActivitiesToSessions({
      sessions: [{ id: "s1", type: "EASY", distance_km: 10 }],
      activities: [{ id: "a1", activity_type: "WeightTraining" }],
      logs: {},
    });
    expect(r.bySessionId.get("s1")).toBeNull();
    expect(r.unmatchedActs.map(a => a.id)).toContain("a1");
  });
});

describe("linkedActsBySession", () => {
  it("matches within each date bucket, not across days", () => {
    const sessionsWithDate = [
      { session: { id: "s1", type: "EASY", distance_km: 10 }, date: "2024-01-01" },
      { session: { id: "s2", type: "EASY", distance_km: 10 }, date: "2024-01-02" },
    ];
    const activities = [
      { id: "a1", activity_type: "Run", distance_km: "10", activity_date: "2024-01-01" },
      { id: "a2", activity_type: "Run", distance_km: "10", activity_date: "2024-01-02" },
    ];
    const out = linkedActsBySession(sessionsWithDate, activities, {});
    expect(out.get("s1").id).toBe("a1");
    expect(out.get("s2").id).toBe("a2");
  });
});
