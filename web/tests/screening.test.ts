import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parsePolygon,
  bboxPolygon,
  coverage,
  areaHa,
  summarizeHabitat,
} from "../src/screening/geo";
import {
  newProject,
  screen,
  parseField,
  validateReview,
  issues,
} from "../src/screening/model";
import { projectGeoJSON, speciesCSV, report } from "../src/screening/exports";
import type { Pack } from "../src/screening/types";
const pack: Pack = JSON.parse(
  readFileSync("../public/screening/mojave-001/pack.json", "utf8"),
);
const site = bboxPolygon(-114.625, 37.2, -114.57, 37.245);
describe("scientific screening", () => {
  it("validates polygon topology and subtracts holes", () => {
    const hole = bboxPolygon(-114.61, 37.21, -114.6, 37.22);
    const p = parsePolygon({
      ...site,
      coordinates: [...site.coordinates, ...hole.coordinates],
    });
    expect(areaHa(p)).toBeCloseTo(areaHa(site) - areaHa(hole), 3);
    expect(() =>
      parsePolygon({
        type: "Polygon",
        coordinates: [
          [
            [-114.6, 37.2],
            [-114.5, 37.3],
            [-114.6, 37.3],
            [-114.5, 37.2],
            [-114.6, 37.2],
          ],
        ],
      }),
    ).toThrow();
    expect(coverage(site, pack.manifest.bbox, 1000)).toEqual({
      outside: false,
      edge: false,
    });
    expect(coverage(site, pack.manifest.bbox, 10000).edge).toBe(true);
  });
  it("preserves candidates without records and never supplies absence decisions", () => {
    const p = newProject();
    p.aoi = site;
    const rows = screen(p, { ...pack, records: [] });
    expect(rows.length).toBe(3);
    expect(
      rows.every(
        (r) => r.records.length === 0 && r.review.decision === "Unreviewed",
      ),
    ).toBe(true);
  });
  it("includes uncertain overlapping records but excludes distant precise records", () => {
    const p = newProject();
    p.aoi = site;
    p.buffer = 100;
    const record = {
      ...pack.records[0],
      longitude: -114.626,
      latitude: 37.22,
      uncertainty_m: 1000,
      generalization_m: 0,
      is_sensitive: false,
      is_obscured: false,
    };
    const rows = screen(p, { ...pack, records: [record] });
    expect(rows.find((r) => r.id === record.taxon_id)?.uncertain).toBe(1);
    record.longitude = -115;
    record.uncertainty_m = 10;
    expect(
      screen(p, { ...pack, records: [record] }).flatMap((r) => r.records),
    ).toHaveLength(0);
  });
  it("rejects impossible dates and incomplete review decisions", () => {
    expect(() =>
      parseField({
        type: "FeatureCollection",
        features: [
          {
            geometry: { type: "Point", coordinates: [-114.6, 37.22] },
            properties: { name: "Test", observer: "Test", date: "2026-02-30" },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      validateReview({
        decision: "Screened out",
        rationale: "",
        reviewer: "A",
        action: "",
        updated: "",
      }),
    ).toThrow();
    expect(() =>
      validateReview({
        decision: "Survey recommended",
        rationale: "Habitat",
        reviewer: "A",
        action: "",
        updated: "",
      }),
    ).toThrow();
  });
  it("protects sensitive field geometry in shared GIS and retains review gates", () => {
    const p = newProject();
    p.aoi = site;
    p.field = parseField({
      type: "FeatureCollection",
      features: [
        {
          geometry: { type: "Point", coordinates: [-114.601234, 37.221234] },
          properties: {
            name: "Sensitive test",
            observer: "Test",
            date: "2026-09-28",
            sensitive: true,
          },
        },
      ],
    });
    const rows = screen(p, pack);
    expect(JSON.stringify(projectGeoJSON(p, rows))).not.toContain(
      "-114.601234",
    );
    expect(issues(p, pack).length).toBeGreaterThan(3);
    const html = report(p, pack, rows, [], "<svg/>");
    expect(html).toContain("DRAFT");
    expect(html).not.toContain("-114.601234");
    rows[0].review.rationale = '=HYPERLINK("bad")';
    expect(speciesCSV(rows)).toContain("'=HYPERLINK");
  });
  it("accounts for real raster cells and NoData", () => {
    const layer = { ...pack.layers[0] };
    const b = readFileSync("../public/screening/mojave-001/" + layer.data);
    layer.values = Int16Array.from({ length: layer.size ** 2 }, (_, i) =>
      b.readInt16LE(i * 2),
    );
    const h = summarizeHabitat(site, layer);
    expect(h.totalCells).toBeGreaterThan(100);
    expect(h.classes.reduce((n, c) => n + c.cells, 0) + h.nodata).toBe(
      h.totalCells,
    );
    expect(
      Math.abs(h.totalCells * h.cellHa - areaHa(site)) / areaHa(site),
    ).toBeLessThan(0.02);
  });
  it("commercial pack contains only reusable licenses", () => {
    expect(pack.records.length).toBe(670);
    expect(
      pack.records.every(
        (r) =>
          r.license.includes("/licenses/by/") ||
          r.license.includes("/publicdomain/zero/"),
      ),
    ).toBe(true);
  });
});
