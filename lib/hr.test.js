import { describe, it, expect } from "vitest";
import {
  getMaxHr, getRestingHr, hrToZone, timeInHrZone,
  efficiencyFactor, aerobicDecoupling, decouplingBand,
} from "./hr.js";

describe("getMaxHr / getRestingHr", () => {
  it("prefers an explicit profile max_hr", () => {
    expect(getMaxHr({ max_hr: 190 }, [])).toBe(190);
  });
  it("estimates max HR from the highest observed activity max", () => {
    const acts = [
      { strava_data: { max_heartrate: 178 } },
      { strava_data: { max_heartrate: 185 } },
      { strava_data: {} },
    ];
    expect(getMaxHr({}, acts)).toBe(185);
  });
  it("returns null with nothing to go on", () => {
    expect(getMaxHr({}, [])).toBeNull();
  });
  it("reads resting HR only from the profile", () => {
    expect(getRestingHr({ resting_hr: 48 })).toBe(48);
    expect(getRestingHr({})).toBeNull();
  });
});

describe("hrToZone", () => {
  it("bands bpm by %HRmax", () => {
    const max = 200;
    expect(hrToZone(110, max)).toBe("Z1"); // 55%
    expect(hrToZone(130, max)).toBe("Z2"); // 65%
    expect(hrToZone(150, max)).toBe("Z3"); // 75%
    expect(hrToZone(170, max)).toBe("Z4"); // 85%
    expect(hrToZone(190, max)).toBe("Z5"); // 95%
  });
  it("returns null without usable inputs", () => {
    expect(hrToZone(0, 200)).toBeNull();
    expect(hrToZone(150, 0)).toBeNull();
  });
});

describe("timeInHrZone", () => {
  it("sums split durations into HR zones", () => {
    const splits = [
      { avg_heartrate: 130, moving_time: 300 }, // Z2
      { avg_heartrate: 170, moving_time: 300 }, // Z4
      { avg_heartrate: 0,   moving_time: 100 }, // skipped (no HR)
    ];
    const tiz = timeInHrZone(splits, 200);
    expect(tiz.Z2).toBe(300);
    expect(tiz.Z4).toBe(300);
    expect(tiz.total).toBe(600);
  });
  it("is empty without a max HR", () => {
    expect(timeInHrZone([{ avg_heartrate: 150, moving_time: 300 }], null).total).toBe(0);
  });
});

describe("efficiencyFactor", () => {
  it("computes metres-per-minute per heartbeat", () => {
    // 1 km in 300 s = 200 m/min; /150 bpm = 1.333
    expect(efficiencyFactor({ distanceKm: 1, durationSec: 300, avgHr: 150 })).toBeCloseTo(1.333, 2);
  });
  it("returns null on missing inputs", () => {
    expect(efficiencyFactor({ distanceKm: 1, durationSec: 300, avgHr: 0 })).toBeNull();
  });
});

describe("aerobicDecoupling", () => {
  it("reports the % EF drop from first to second half", () => {
    // Equal-duration splits so the time-split is a clean 2/2. First half
    // 3.333 m/s, second half 3.0 m/s, HR flat → 10% decoupling.
    const splits = [
      { distance_m: 1000, moving_time: 300, avg_heartrate: 150 },
      { distance_m: 1000, moving_time: 300, avg_heartrate: 150 },
      { distance_m: 900,  moving_time: 300, avg_heartrate: 150 },
      { distance_m: 900,  moving_time: 300, avg_heartrate: 150 },
    ];
    expect(aerobicDecoupling(splits)).toBeCloseTo(10, 1);
  });
  it("is negative for a negative split (faster for same HR)", () => {
    const splits = [
      { distance_m: 900,  moving_time: 300, avg_heartrate: 150 },
      { distance_m: 900,  moving_time: 300, avg_heartrate: 150 },
      { distance_m: 1000, moving_time: 300, avg_heartrate: 150 },
      { distance_m: 1000, moving_time: 300, avg_heartrate: 150 },
    ];
    expect(aerobicDecoupling(splits)).toBeLessThan(0);
  });
  it("returns null with fewer than 4 usable splits", () => {
    expect(aerobicDecoupling([{ distance_m: 1000, moving_time: 300, avg_heartrate: 150 }])).toBeNull();
  });
});

describe("decouplingBand", () => {
  it("bands the percentage", () => {
    expect(decouplingBand(3)).toBe("coupled");
    expect(decouplingBand(7)).toBe("drifting");
    expect(decouplingBand(12)).toBe("decoupled");
    expect(decouplingBand(null)).toBeNull();
  });
});
