import type { Detail, Species } from "../data/types";
import { project } from "./geo";
import type { HabitatLayer, Pack, XY } from "./types";

export interface PixelSample {
  layer: HabitatLayer;
  code: number | null;
  label: string;
  row: number;
  column: number;
}

/** Sample the displayed nearest-neighbour analysis grid, not the source GeoTIFF. */
export function sampleHabitat(layer: HabitatLayer, point: XY): PixelSample {
  const [x, y] = project(point);
  const [w, s, e, n] = layer.bounds;
  const column = Math.floor(((x - w) / (e - w)) * layer.size);
  const row = Math.floor(((n - y) / (n - s)) * layer.size);
  if (column < 0 || row < 0 || column >= layer.size || row >= layer.size)
    return { layer, code: null, label: "Outside mapped coverage", row, column };
  const code = layer.values?.[row * layer.size + column];
  if (code === undefined || code === -9999)
    return { layer, code: null, label: "No mapped value", row, column };
  return {
    layer,
    code,
    label:
      layer.legend.find((entry) => entry.code === code)?.label ||
      `Class ${code}`,
    row,
    column,
  };
}

export interface NearbyRecord {
  record: Detail;
  distance: number;
  uncertainty: number;
  overlaps: boolean;
}

/** A public coordinate is evidence with uncertainty, never a known species location. */
export function nearbyRecords(
  pack: Pack,
  point: XY,
  radius: number,
): NearbyRecord[] {
  const [x, y] = project(point);
  return pack.records
    .flatMap((record) => {
      const [rx, ry] = project([record.longitude, record.latitude]);
      const distance = Math.hypot(rx - x, ry - y);
      const uncertainty = Math.max(
        record.uncertainty_m || 0,
        record.generalization_m || 0,
      );
      if (distance > radius + uncertainty) return [];
      return [
        {
          record,
          distance,
          uncertainty,
          overlaps:
            distance > radius || record.is_sensitive || record.is_obscured,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance);
}

export function regionalSpecies(
  pack: Pack,
): { species: Species; records: Detail[] }[] {
  const groups = new Map<string, Detail[]>();
  for (const record of pack.records) {
    const records = groups.get(record.taxon_id) || [];
    records.push(record);
    groups.set(record.taxon_id, records);
  }
  return pack.species
    .filter((species) => groups.has(species.id))
    .map((species) => ({
      species,
      records: groups.get(species.id)!,
    }))
    .sort(
      (a, b) =>
        b.records.length - a.records.length ||
        a.species.name.localeCompare(b.species.name),
    );
}
