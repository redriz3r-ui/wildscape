import { describe, it, expect } from "vitest";
import { analyzeSun } from "../src/terrain/sun";
const settings = { enabled: true, azimuth: 90, altitude: 10, shadows: true };
describe("DEM illumination and cast shadows", () => {
  it("a flat unobstructed grid has no terrain cast shadow", () => {
    const result = analyzeSun({
      heights: new Float32Array(17 * 17),
      size: 17,
      width: 160,
      height: 160,
      settings,
    });
    expect(result.stats.shadowKm2).toBe(0);
    expect(result.stats.cellMeters).toBe(10);
  });
  it("a ridge blocks low eastern sun on its western side", () => {
    const heights = new Float32Array(17 * 17);
    for (let row = 0; row < 17; row++) heights[row * 17 + 10] = 50;
    const low = analyzeSun({
      heights,
      size: 17,
      width: 160,
      height: 160,
      settings,
    });
    const high = analyzeSun({
      heights,
      size: 17,
      width: 160,
      height: 160,
      settings: { ...settings, altitude: 80 },
    });
    expect(low.stats.shadowKm2).toBeGreaterThan(high.stats.shadowKm2);
    expect(low.bytes[(8 * 17 + 4) * 4 + 3]).toBe(163);
    expect(low.bytes[(8 * 17 + 14) * 4 + 3]).toBeLessThan(163);
  });
  it("cast shadows can be disabled while retaining slope illumination", () => {
    const heights = new Float32Array(17 * 17);
    heights[8 * 17 + 8] = 100;
    const result = analyzeSun({
      heights,
      size: 17,
      width: 160,
      height: 160,
      settings: { ...settings, shadows: false },
    });
    expect(result.stats.shadowPercent).toBe(0);
  });
});
