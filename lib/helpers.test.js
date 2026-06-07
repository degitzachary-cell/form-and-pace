import { describe, it, expect } from "vitest";
import {
  parseLocalDate, ymd, sessionDateStr, weekEndStr, snapToMonday,
  todayStr, isRunType, weekKm, prettyEmailName, fmtPace, fmtTime,
} from "./helpers.js";

describe("date helpers", () => {
  it("parseLocalDate is local midnight, not UTC", () => {
    const d = parseLocalDate("2025-05-02");
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it("ymd formats local date parts", () => {
    expect(ymd(new Date(2025, 4, 2))).toBe("2025-05-02");
    expect(ymd(new Date(2024, 0, 9))).toBe("2024-01-09");
  });

  it("sessionDateStr offsets from the week's Monday", () => {
    // 2024-01-01 is a Monday
    expect(sessionDateStr("2024-01-01", "Mon")).toBe("2024-01-01");
    expect(sessionDateStr("2024-01-01", "Tue")).toBe("2024-01-02");
    expect(sessionDateStr("2024-01-01", "Sun")).toBe("2024-01-07");
  });

  it("weekEndStr is Monday + 6", () => {
    expect(weekEndStr("2024-01-01")).toBe("2024-01-07");
  });

  it("snapToMonday snaps any day back to its Monday", () => {
    expect(snapToMonday("2024-01-03")).toBe("2024-01-01"); // Wed → Mon
    expect(snapToMonday("2024-01-07")).toBe("2024-01-01"); // Sun → Mon
    expect(snapToMonday("2024-01-01")).toBe("2024-01-01"); // Mon → Mon
  });
});

describe("isRunType", () => {
  it("treats run-flavoured + null types as runs", () => {
    expect(isRunType("easy")).toBe(true);
    expect(isRunType("Long Run")).toBe(true);
    expect(isRunType("TrailRun")).toBe(true);
    expect(isRunType(null)).toBe(true);
  });
  it("excludes non-run sports", () => {
    expect(isRunType("Ride")).toBe(false);
    expect(isRunType("Strength")).toBe(false);
    expect(isRunType("Swim")).toBe(false);
  });
});

describe("weekKm", () => {
  it("sums this week's run km for the athlete", () => {
    const acts = [
      { athlete_email: "a@b.com", activity_type: "easy", distance_km: "10", activity_date: todayStr() },
      { athlete_email: "a@b.com", activity_type: "Ride", distance_km: "40", activity_date: todayStr() }, // not a run
      { athlete_email: "other@b.com", activity_type: "easy", distance_km: "5", activity_date: todayStr() }, // other athlete
    ];
    expect(weekKm(acts, "a@b.com", 0)).toBe(10);
  });
});

describe("prettyEmailName", () => {
  it("derives a display name from the local part", () => {
    expect(prettyEmailName("jeremy@x.com")).toBe("Jeremy");
    expect(prettyEmailName("zhang.1701@gmail.com")).toBe("Zhang");
    expect(prettyEmailName("")).toBe("");
  });
});

describe("format helpers", () => {
  it("fmtPace converts m/s to min/km", () => {
    // 1000m / 300s = 3.333 m/s → 5:00/km
    expect(fmtPace(1000 / 300)).toBe("5:00/km");
    expect(fmtPace(0)).toBe("–");
  });
  it("fmtTime formats seconds", () => {
    expect(fmtTime(5025)).toBe("1:23:45");
    expect(fmtTime(125)).toBe("2:05");
  });
});
