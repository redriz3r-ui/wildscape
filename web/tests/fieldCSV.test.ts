import { describe, it, expect } from "vitest";
import { parseFieldCSV } from "../src/screening/fieldCSV";
import { parseField } from "../src/screening/model";
describe("field survey CSV ingestion", () => {
  it("preserves quoted evidence and defaults missing sensitivity to private", () => {
    const rows = parseFieldCSV('name,date,observer,longitude,latitude,notes\r\n"Gopherus agassizii",2026-09-30,"A, B",-114.6,37.22,"Burrow, no animal\nPhoto says ""check"""');
    expect(rows[0].observer).toBe("A, B");
    expect(rows[0].notes).toBe('Burrow, no animal\nPhoto says "check"');
    expect(rows[0].sensitive).toBe(true);
    expect(rows[0].geometry).toEqual({type:"Point", coordinates:[-114.6,37.22]});
  });
  it("requires explicit sharing and rejects ambiguous coordinates or sensitivity", () => {
    const head = 'name,date,observer,longitude,latitude,sensitive\n';
    expect(parseFieldCSV(head + 'Taxon,2026-09-30,Observer,-114.6,37.22,false')[0].sensitive).toBe(false);
    expect(() => parseFieldCSV(head + 'Taxon,2026-09-30,Observer,,37.22,false')).toThrow(/longitude/);
    expect(() => parseFieldCSV(head + 'Taxon,2026-09-30,Observer,-114.6,37.22,maybe')).toThrow(/sensitive/);
    expect(() => parseFieldCSV(head + 'Taxon,2026-02-31,Observer,-114.6,37.22,true')).toThrow(/date/);
    expect(() => parseFieldCSV(head + '"Taxon,2026-09-30,Observer,-114.6,37.22,true')).toThrow(/unclosed/);
  });
  it("also treats GeoJSON without a sensitivity decision as private", () => {
    const rows = parseField({type:"FeatureCollection",features:[{type:"Feature",geometry:{type:"Point",coordinates:[-114.6,37.22]},properties:{name:"Taxon",date:"2026-09-30",observer:"Observer"}}]});
    expect(rows[0].sensitive).toBe(true);
  });
});
