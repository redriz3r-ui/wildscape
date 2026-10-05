export type Mode = "WORLD" | "AERIAL" | "VEGETATION" | "ELEVATION" | "SPECIES";
export interface TerrainMeta {
  crs: string;
  size: number;
  low_size: number;
  grid_bounds: number[];
  origin: number[];
  width_m: number;
  height_m: number;
  elevation_min: number;
  elevation_max: number;
  bbox: number[];
}
export interface WorldSummary {
  id: string;
  name: string;
  bbox: number[];
  fixture: boolean;
  species_count: number;
  occurrence_count: number;
}
export interface Manifest extends WorldSummary {
  build_version: string;
  built_at: string;
  earliest_record: string | null;
  latest_record: string | null;
  terrain: TerrainMeta;
  assets: Record<string, string>;
  imagery_pyramid?: {
    max_level: number;
    meters_per_pixel: number;
    tile_size: number;
  };
  warnings: string[];
  ecosystem: { system: string; code: number };
}
export interface Media {
  url: string;
  thumbnail_url: string;
  creator: string;
  license: string;
  attribution: string;
  source: string;
}
export interface Species {
  id: string;
  name: string;
  common_name: string;
  rank: string;
  group: string;
  parent_taxonomy?: Record<string, string>;
  count: number;
  first_record: string | null;
  last_record: string | null;
  elevation_range: number[] | null;
  sources: string[];
  media: Media[];
  conservation: unknown[];
}
export interface Observation {
  id: string;
  taxon_id: string;
  longitude: number;
  latitude: number;
  event_date: string | null;
  is_sensitive: boolean;
  is_historical: boolean;
  basis_of_record: string;
  uncertainty_m: number;
  outside_terrain: boolean;
}
export interface Detail extends Observation {
  source: string;
  source_dataset: string;
  license: string;
  basis_of_record: string;
  source_url?: string;
  generalization_m: number;
  is_obscured: boolean;
  quality_flags: string[];
  elevation?: number;
}
export type Placement = [string, number, number, number, number, number];
export interface VegetationMeta {
  models: Record<string, { color: string; scale: number; weight: number }>;
  warning?: string;
  note?: string;
}
export interface WorldData {
  base: string;
  manifest: Manifest;
  species: Species[];
  observations: Observation[];
  elevation: Float32Array;
  placements: Placement[];
  vegetation: VegetationMeta;
}
