import type { Detail, Manifest, Species } from "../data/types";
export type XY = [number, number];
export type Polygon = { type: "Polygon"; coordinates: XY[][] };
export interface HabitatLayer {
  id: string;
  title: string;
  note: string;
  size: number;
  bounds: number[];
  crs: string;
  cell_m: number;
  source_resolution_m: number;
  legend: { code: number; label: string; color: string }[];
  data: string;
  image: string;
  source: string;
  provenance: unknown;
  values?: Int16Array;
}
export interface Pack {
  schema: number;
  world: string;
  created_at: string;
  manifest_sha256: string;
  manifest: Manifest;
  species: Species[];
  records: Detail[];
  excluded_licenses: Record<string, number>;
  layers: HabitatLayer[];
  notes: string[];
}
export interface Candidate {
  id: string;
  name: string;
  common: string;
  group: string;
  reason: string;
  habitat: string;
  source: string;
  sourceTitle: string;
  checked: string;
  origin: "regional" | "consultant";
}
export type Decision =
  | "Unreviewed"
  | "Further assessment"
  | "Survey recommended"
  | "Retain for screening"
  | "Screened out";
export interface Review {
  decision: Decision;
  rationale: string;
  action: string;
  reviewer: string;
  updated: string;
}
export interface FieldRecord {
  id: string;
  name: string;
  kind:
    | "Observation"
    | "Burrow / sign"
    | "Nest"
    | "Survey track"
    | "Survey area";
  geometry:
    | { type: "Point"; coordinates: XY }
    | { type: "LineString"; coordinates: XY[] }
    | Polygon;
  date: string;
  observer: string;
  method: string;
  effort: string;
  notes: string;
  photo: string;
  sensitive: boolean;
}
export interface Project {
  schema: 1;
  id: string;
  name: string;
  client: string;
  reference: string;
  purpose: string;
  world: string;
  aoi: Polygon | null;
  buffer: number;
  since: string;
  example: boolean;
  created: string;
  updated: string;
  revision: number;
  candidates: Candidate[];
  reviews: Record<string, Review>;
  field: FieldRecord[];
  notes: string;
  reviewer: string;
  agencyNotes: string;
  agencyChecked: boolean;
  habitatChecked: boolean;
  status: "Draft" | "Reviewed";
  reviewedRevision?: number;
  history: { date: string; action: string }[];
}
export interface ScreeningRow {
  id: string;
  name: string;
  common: string;
  group: string;
  candidate?: Candidate;
  records: Detail[];
  inside: number;
  nearby: number;
  uncertain: number;
  latest: string;
  distance: number | null;
  review: Review;
  fieldCount: number;
}
export interface HabitatSummary {
  layer: string;
  totalCells: number;
  nodata: number;
  cellHa: number;
  classes: {
    code: number;
    label: string;
    color: string;
    cells: number;
    ha: number;
    percent: number;
  }[];
}
