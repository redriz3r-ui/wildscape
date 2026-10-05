import { describe, it, expect } from "vitest";
import { Coordinates } from "../src/terrain/coordinates";
import { SpatialIndex, aggregate } from "../src/wildlife/spatial";
import { State } from "../src/app/State";
import type { Observation, TerrainMeta } from "../src/data/types";
const record = (id: string, lon: number, lat: number): Observation => ({
  id,
  taxon_id: "one",
  longitude: lon,
  latitude: lat,
  event_date: "2020-01-01",
  is_sensitive: false,
  is_historical: false,
  basis_of_record: "HUMAN_OBSERVATION",
  uncertainty_m: 10,
  outside_terrain: false,
});
describe("public spatial data", () => {
  it("geodesic radius excludes nearby but out-of-radius points", () => {
    const rows = [
      record("a", -115.5, 35.3),
      record("b", -115.51, 35.3),
      record("c", -115.6, 35.3),
    ];
    expect(
      new SpatialIndex(rows).nearby(-115.5, 35.3, 2).map((r) => r.id),
    ).toEqual(["a", "b"]);
  });
  it("aggregation conserves records", () => {
    const rows = [record("a", -115.5, 35.3), record("b", -115.501, 35.301)];
    expect(aggregate(rows, 5).reduce((n, c) => n + c.count, 0)).toBe(2);
    expect(aggregate(rows, null)).toHaveLength(2);
    const cluster = aggregate(rows, 5)[0];
    expect(cluster.longitude).toBeCloseTo(-115.5005, 6);
    expect(cluster.latitude).toBeCloseTo(35.3005, 6);
  });
  it("empty spatial query is valid", () =>
    expect(new SpatialIndex([]).nearby(0, 0, 2)).toEqual([]));
});
describe("explicit coordinates", () => {
  const meta = {
    crs: "EPSG:32611",
    origin: [630000, 3910000, 700],
    grid_bounds: [629000, 3909000, 631000, 3911000],
  } as TerrainMeta;
  const coords = new Coordinates(meta);
  it("round trips geographic positions within one millimeter", () => {
    const s = coords.toScene(-115.55, 35.32, 1234);
    const g = coords.toGeo(...s);
    expect(g[0]).toBeCloseTo(-115.55, 8);
    expect(g[1]).toBeCloseTo(35.32, 8);
    expect(g[2]).toBe(1234);
  });
  it("samples elevation bilinearly with correct north orientation", () => {
    const h = new Float32Array([700, 800, 900, 1000]);
    expect(coords.sample(h, 2, 0, 0)).toBe(150);
    expect(coords.sample(h, 2, -1000, -1000)).toBe(0);
    expect(coords.sample(h, 2, 1001, 0)).toBeNull();
  });
});
it("state transitions preserve visualization mode", () => {
  const s = new State();
  s.set({ phase: "WORLD", world: "demo", mode: "ELEVATION" });
  s.set({ phase: "SPECIES_SELECTED", species: "one" });
  expect(s.value.mode).toBe("ELEVATION");
  expect(s.value.species).toBe("one");
});
