import { latLngToCell, gridDisk } from "h3-js";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Observation } from "../data/types";
export interface Marker {
  longitude: number;
  latitude: number;
  count: number;
  records: Observation[];
  id: string;
}
export function aggregate(
  rows: Observation[],
  resolution: number | null,
): Marker[] {
  if (resolution === null)
    return rows
      .filter((r) => !r.outside_terrain)
      .map((r) => ({ ...r, count: 1, records: [r] }));
  const cells = new Map<string, Observation[]>();
  for (const r of rows) {
    if (r.outside_terrain) continue;
    const key = latLngToCell(r.latitude, r.longitude, resolution);
    const list = cells.get(key) || [];
    list.push(r);
    cells.set(key, list);
  }
  return [...cells].map(([id, records]) => {
    // Keep regional markers inside their public evidence footprint. H3 cell
    // centers can fall beyond the small terrain extent.
    const latitude =
      records.reduce((sum, r) => sum + r.latitude, 0) / records.length;
    const longitude =
      records.reduce((sum, r) => sum + r.longitude, 0) / records.length;
    return { id, longitude, latitude, count: records.length, records };
  });
}
export class SpatialIndex {
  private cells = new Map<string, Observation[]>();
  constructor(private rows: Observation[]) {
    for (const row of rows) {
      const cell = latLngToCell(row.latitude, row.longitude, 7);
      const values = this.cells.get(cell) || [];
      values.push(row);
      this.cells.set(cell, values);
    }
  }
  nearby(lon: number, lat: number, radiusKm = 2) {
    // H3 only narrows candidates; geodesic distance makes the final inclusion decision.
    const cell = latLngToCell(lat, lon, 7);
    const origin = point([lon, lat]);
    const candidates =
      radiusKm <= 5
        ? gridDisk(cell, Math.ceil(radiusKm / 1.1) + 3).flatMap(
            (c) => this.cells.get(c) || [],
          )
        : this.rows;
    return candidates.filter(
      (r) =>
        distance(origin, point([r.longitude, r.latitude]), {
          units: "kilometers",
        }) <= radiusKm,
    );
  }
}
