import { describe, it, expect } from "vitest";
import { parseTime, normalizePlan, cleanPbGoal, fmtPbGoal } from "./constants.js";

describe("parseTime", () => {
  it("parses mm:ss and h:mm:ss", () => {
    expect(parseTime("19:25")).toEqual({ h: 0, m: 19, s: 25 });
    expect(parseTime("1:30:14")).toEqual({ h: 1, m: 30, s: 14 });
    expect(parseTime("")).toEqual({ h: 0, m: 0, s: 0 });
  });
});

describe("normalizePlan", () => {
  it("handles a bare weeks array (legacy)", () => {
    expect(normalizePlan([{ weekStart: "2024-01-01" }])).toEqual({
      weeks: [{ weekStart: "2024-01-01" }], meta: {},
    });
  });
  it("handles the object shape with meta", () => {
    const r = normalizePlan({ weeks: [1, 2], athleteName: "Sam", defaultWeek: { x: 1 } });
    expect(r.weeks).toEqual([1, 2]);
    expect(r.meta.name).toBe("Sam");
    expect(r.meta.defaultWeek).toEqual({ x: 1 });
  });
  it("handles null/garbage", () => {
    expect(normalizePlan(null)).toEqual({ weeks: [], meta: {} });
    expect(normalizePlan(undefined).weeks).toEqual([]);
  });
});

describe("cleanPbGoal / fmtPbGoal", () => {
  it("strips empties and returns null when nothing remains", () => {
    expect(cleanPbGoal({ "5k": "20:00", "10k": "" })).toEqual({ "5k": "20:00" });
    expect(cleanPbGoal({ "5k": "  " })).toBeNull();
    expect(cleanPbGoal({})).toBeNull();
  });
  it("formats a label string", () => {
    expect(fmtPbGoal({ "5k": "20:00", half_marathon: "1:30:00" })).toBe("5K 20:00 · HM 1:30:00");
    expect(fmtPbGoal({ other: "Comrades sub-9" })).toBe("Comrades sub-9");
    expect(fmtPbGoal({})).toBeNull();
  });
});
