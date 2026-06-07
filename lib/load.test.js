import { describe, it, expect } from "vitest";
import {
  paceStrToSecsPerKm, predictDistanceKm, maskPaceInput, displayPace, displayDistance,
  computeRtss, gradeCompliance, aggregateSteps, computePMC, forecastPMC,
  riegelPredict, pbStrToSeconds, secondsToTimeStr, predictRaces, expandZonePace,
  defaultRpeTarget, autoClassifyRunType, isLogReal, effectiveCompliance,
} from "./load.js";

describe("pace parsing", () => {
  it("parses min:sec to secs/km", () => {
    expect(paceStrToSecsPerKm("5:00")).toBe(300);
    expect(paceStrToSecsPerKm("4:35/km")).toBe(275);
    expect(paceStrToSecsPerKm("")).toBeNull();
    expect(paceStrToSecsPerKm("easy")).toBeNull();
  });

  it("masks free-typed pace input", () => {
    expect(maskPaceInput("435")).toBe("4:35");
    expect(maskPaceInput("1235")).toBe("12:35");
    expect(maskPaceInput("4:35/km")).toBe("4:35");
    expect(maskPaceInput("")).toBe("");
    expect(maskPaceInput("4.35")).toBe("4:35");
  });

  it("displays pace with unit and converts to miles", () => {
    expect(displayPace("4:35", "km")).toBe("4:35/km");
    expect(displayPace("4:35", "mi")).toBe("7:23/mi"); // 275s/km × 1.609344
    expect(displayPace("5:10-5:30", "km")).toBe("5:10-5:30/km");
  });

  it("converts distance to miles", () => {
    expect(displayDistance(10, "km")).toBe(10);
    expect(displayDistance(10, "mi")).toBe(6.2);
    expect(displayDistance(null)).toBeNull();
  });
});

describe("predictDistanceKm", () => {
  it("derives km from duration + pace", () => {
    // 60 min at 6:00/km = 10 km
    expect(predictDistanceKm(60, "6:00")).toBe(10);
    // pace range averages
    expect(predictDistanceKm(60, "5:00-7:00")).toBeCloseTo(10, 1);
  });
  it("returns null on bad input", () => {
    expect(predictDistanceKm(0, "5:00")).toBeNull();
    expect(predictDistanceKm(60, "easy")).toBeNull();
  });
});

describe("computeRtss", () => {
  it("an hour at threshold pace = 100 rTSS", () => {
    // threshold 300s/km, run 12km in 3600s → pace 300 → IF 1
    expect(computeRtss({ durationSec: 3600, distanceKm: 12, thresholdSecsPerKm: 300 })).toBe(100);
  });
  it("easy hour is well below 100", () => {
    // 10km in 3600s → 360s/km, IF 0.833 → ~69
    const r = computeRtss({ durationSec: 3600, distanceKm: 10, thresholdSecsPerKm: 300 });
    expect(r).toBeGreaterThan(60);
    expect(r).toBeLessThan(80);
  });
  it("returns null on missing inputs", () => {
    expect(computeRtss({ durationSec: 0, distanceKm: 10, thresholdSecsPerKm: 300 })).toBeNull();
  });
});

describe("gradeCompliance", () => {
  const planned = { distance_km: 10 };
  it("bands by ratio of actual to planned", () => {
    expect(gradeCompliance({ planned, actual: { distance_km: 10 } })).toBe("completed");
    expect(gradeCompliance({ planned, actual: { distance_km: 6 } })).toBe("partial");
    expect(gradeCompliance({ planned, actual: { distance_km: 4 } })).toBe("missed");
    expect(gradeCompliance({ planned, actual: { distance_km: 13 } })).toBe("over");
  });
  it("prefers rTSS axis over distance", () => {
    expect(gradeCompliance({
      planned: { rtss: 100, distance_km: 10 },
      actual:  { rtss: 100, distance_km: 4 },
    })).toBe("completed");
  });
  it("returns null with no comparable axis", () => {
    expect(gradeCompliance({ planned: {}, actual: {} })).toBeNull();
  });
});

describe("aggregateSteps", () => {
  it("sums interval work + recovery distance", () => {
    const agg = aggregateSteps([{ kind: "interval", reps: 4, work: { distance_m: 1000 }, recovery: { distance_m: 200 } }]);
    expect(agg.distance_km).toBeCloseTo(4.8, 1);
  });
  it("honours steady km", () => {
    const agg = aggregateSteps([{ kind: "steady", distance_km: 8 }]);
    expect(agg.distance_km).toBe(8);
  });
  it("predicts km from a timed warmup with pace", () => {
    const agg = aggregateSteps([{ kind: "warmup", duration_min: 15, pace: "6:00" }]);
    expect(agg.duration_min).toBe(15);
    expect(agg.distance_km).toBeCloseTo(2.5, 1);
  });
});

describe("PMC", () => {
  it("CTL approaches a constant daily load", () => {
    const series = Array.from({ length: 200 }, (_, i) => ({ date: `d${i}`, rtss: 100 }));
    const pmc = computePMC(series);
    const last = pmc[pmc.length - 1];
    expect(last.ctl).toBeGreaterThan(95);
    expect(last.atl).toBeGreaterThan(95);
    expect(Math.abs(last.tsb)).toBeLessThan(2);
  });
  it("forecast moves fitness toward future load", () => {
    const out = forecastPMC({ ctl: 50, atl: 30 }, [{ date: "d1", rtss: 120 }]);
    expect(out[0].ctl).toBeGreaterThan(50);
    expect(out[0].atl).toBeGreaterThan(30);
  });
  it("empty input yields empty series", () => {
    expect(computePMC([])).toEqual([]);
    expect(forecastPMC({ ctl: 1 }, [])).toEqual([]);
  });
});

describe("race predictor", () => {
  it("riegel predicts slower paces over longer distances", () => {
    const t = riegelPredict(1200, 5, 10); // 20:00 5k → 10k
    expect(t).toBeGreaterThan(2400);  // slower than 2× 5k pace
    expect(t).toBeLessThan(2700);
  });
  it("round-trips time strings", () => {
    expect(pbStrToSeconds("1:23:45")).toBe(5025);
    expect(pbStrToSeconds("23:45")).toBe(1425);
    expect(secondsToTimeStr(5025, true)).toBe("1:23:45");
    expect(secondsToTimeStr(1425)).toBe("23:45");
  });
  it("predictRaces marks actual PBs and predicts the rest", () => {
    const out = predictRaces({ "5k": "20:00" });
    expect(out["5k"].isActual).toBe(true);
    expect(out["10k"].isActual).toBe(false);
    expect(out["10k"].seconds).toBeGreaterThan(out["5k"].seconds);
  });
});

describe("zone pace expansion", () => {
  it("expands a zone token against threshold", () => {
    const out = expandZonePace("T", { threshold_pace: "5:00" });
    expect(out).toMatch(/^\d:\d\d-\d:\d\d$/);
  });
  it("passes through when no threshold set", () => {
    expect(expandZonePace("T", {})).toBe("T");
  });
  it("passes through absolute paces", () => {
    expect(expandZonePace("5:10", { threshold_pace: "5:00" })).toBe("5:10");
  });
});

describe("defaultRpeTarget", () => {
  it("maps workout type to a target band", () => {
    expect(defaultRpeTarget("EASY")).toBe("3-4");
    expect(defaultRpeTarget("SPEED")).toBe("8-9");
    expect(defaultRpeTarget("REST")).toBe("");
    expect(defaultRpeTarget(undefined)).toBe("3-4");
  });
});

describe("autoClassifyRunType", () => {
  it("classifies a long run by distance", () => {
    expect(autoClassifyRunType({ distanceKm: 25, durationSec: 9000 })).toBe("LONG");
  });
  it("defaults to easy without threshold", () => {
    expect(autoClassifyRunType({ distanceKm: 8, durationSec: 2880 })).toBe("EASY");
  });
});

describe("isLogReal / effectiveCompliance", () => {
  it("treats empty/stub logs as not real", () => {
    expect(isLogReal(null)).toBe(false);
    expect(isLogReal({ analysis: { actual_date: "2024-01-01" } })).toBe(false);
    expect(isLogReal({ feedback: "felt great" })).toBe(true);
    expect(isLogReal({ analysis: { compliance: "completed" } })).toBe(true);
  });
  it("honours an explicit compliance override", () => {
    expect(effectiveCompliance({ session: { type: "EASY" }, log: { analysis: { compliance: "missed" } } })).toBe("missed");
  });
  it("marks a past unlogged non-rest session missed", () => {
    expect(effectiveCompliance({ session: { type: "EASY" }, log: null, isPastDate: true })).toBe("missed");
  });
  it("future unlogged session is pending", () => {
    expect(effectiveCompliance({ session: { type: "EASY" }, log: null, isPastDate: false })).toBe("pending");
  });
});
