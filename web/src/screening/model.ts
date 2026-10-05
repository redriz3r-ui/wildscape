import type {
  Candidate,
  FieldRecord,
  Pack,
  Polygon,
  Project,
  Review,
  ScreeningRow,
} from "./types";
import {
  boundaryDistance,
  coverage,
  distanceTo,
  inPolygon,
  parsePolygon,
  project,
  validatePoint,
} from "./geo";
import { regionalCandidates } from "./candidates";
export const emptyReview = (): Review => ({
  decision: "Unreviewed",
  rationale: "",
  action: "",
  reviewer: "",
  updated: "",
});
const now = () => new Date().toISOString();
export function newProject(example = false): Project {
  return {
    schema: 1,
    id: crypto.randomUUID(),
    name: example ? "Mojave screening · worked example" : "Untitled screening",
    client: "",
    reference: "",
    purpose: "Habitat and species screening",
    world: "mojave-001",
    aoi: null,
    buffer: 1000,
    since: "",
    example,
    created: now(),
    updated: now(),
    revision: 1,
    candidates: [],
    reviews: {},
    field: [],
    notes: "",
    reviewer: "",
    agencyNotes: "",
    agencyChecked: false,
    habitatChecked: false,
    status: "Draft",
    history: [],
  };
}
export function touch(p: Project, action: string) {
  p.updated = now();
  p.revision++;
  p.status = "Draft";
  p.reviewedRevision = undefined;
  p.history.push({ date: p.updated, action });
  p.history = p.history.slice(-100);
}
export function screen(p: Project, pack: Pack): ScreeningRow[] {
  if (!p.aoi) return [];
  const rings = p.aoi.coordinates.map((r) => r.map(project));
  const species = new Map(pack.species.map((s) => [s.id, s]));
  const rows = new Map<string, ScreeningRow>();
  const add = (
    id: string,
    name: string,
    common: string,
    group: string,
    candidate?: Candidate,
  ) => {
    if (!rows.has(id))
      rows.set(id, {
        id,
        name,
        common,
        group,
        candidate,
        records: [],
        inside: 0,
        nearby: 0,
        uncertain: 0,
        latest: "",
        distance: null,
        review: p.reviews[id] || emptyReview(),
        fieldCount: 0,
      });
    else if (candidate) rows.get(id)!.candidate = candidate;
    return rows.get(id)!;
  };
  for (const c of [...regionalCandidates, ...p.candidates]) {
    const sp = pack.species.find(
      (s) => s.name.toLowerCase() === c.name.toLowerCase(),
    );
    add(sp?.id || c.id, c.name, c.common, c.group, c);
  }
  for (const r of pack.records) {
    if (p.since && (!r.event_date || r.event_date.slice(0, 10) < p.since))
      continue;
    const xy = project([r.longitude, r.latitude]),
      d = distanceTo(xy, rings),
      u = Math.max(r.uncertainty_m || 0, r.generalization_m || 0);
    if (d > p.buffer + u) continue;
    const s = species.get(r.taxon_id);
    if (!s) continue;
    const row = add(s.id, s.name, s.common_name, s.group);
    row.records.push(r);
    const uncertain =
      r.is_sensitive ||
      r.is_obscured ||
      u === 0 ||
      (d > 0 && (d < u || d + u > p.buffer)) ||
      (inPolygon(xy, rings) && boundaryDistance(xy, rings) < u);
    if (uncertain) row.uncertain++;
    else if (inPolygon(xy, rings)) row.inside++;
    else row.nearby++;
    if (!r.is_sensitive && !r.is_obscured)
      row.distance = Math.min(row.distance ?? Infinity, d);
    row.latest = [row.latest, r.event_date || ""].sort().at(-1)!;
  }
  for (const f of p.field) {
    const sp = pack.species.find(
      (s) => s.name.toLowerCase() === f.name.toLowerCase(),
    );
    const c = [...regionalCandidates, ...p.candidates].find(
      (c) => c.name.toLowerCase() === f.name.toLowerCase(),
    );
    const row = add(
      sp?.id || c?.id || "field:" + f.name.toLowerCase(),
      f.name,
      sp?.common_name || c?.common || "",
      sp?.group || c?.group || "Field evidence",
      c,
    );
    row.fieldCount++;
  }
  // Retain prior decisions even if date/buffer filters remove their evidence.
  for (const id of Object.keys(p.reviews)) {
    if (rows.has(id)) continue;
    const sp = species.get(id);
    if (sp) add(id, sp.name, sp.common_name, sp.group);
  }
  return [...rows.values()].sort(
    (a, b) =>
      Number(!!b.candidate) - Number(!!a.candidate) ||
      b.records.length - a.records.length ||
      a.name.localeCompare(b.name),
  );
}
export function issues(
  p: Project,
  pack: Pack,
  rows = screen(p, pack),
): string[] {
  const a: string[] = [];
  if (!p.aoi) a.push("Define a project boundary.");
  else {
    const c = coverage(p.aoi, pack.manifest.bbox, p.buffer);
    if (c.outside)
      a.push("The project exceeds the available regional data coverage.");
    if (c.edge)
      a.push(
        "The search area reaches beyond the regional pack; obtain additional evidence or document this gap.",
      );
  }
  if (!p.client.trim()) a.push("Name the client or project owner.");
  if (!p.reviewer.trim()) a.push("Name the reviewing biologist.");
  if (!p.agencyChecked || !p.agencyNotes.trim())
    a.push("Document agency and regional source checks.");
  if (!p.habitatChecked || !p.notes.trim())
    a.push("Complete the habitat interpretation and limitations.");
  const pending = rows.filter((r) => r.review.decision === "Unreviewed").length;
  if (pending) a.push(`${pending} species need a recorded review decision.`);
  if (p.example)
    a.push(
      "Example boundary: replace it with the real project footprint before issuing a client assessment.",
    );
  return a;
}
const decisions = [
  "Unreviewed",
  "Further assessment",
  "Survey recommended",
  "Retain for screening",
  "Screened out",
];
export function validateReview(r: Review) {
  if (!decisions.includes(r.decision)) throw Error("Unknown review decision.");
  if (
    r.decision !== "Unreviewed" &&
    (!r.rationale.trim() || !r.reviewer.trim())
  )
    throw Error("A decision requires a rationale and reviewing biologist.");
  if (
    ["Survey recommended", "Further assessment"].includes(r.decision) &&
    !r.action.trim()
  )
    throw Error("Describe the next action for this decision.");
}
export function parseField(value: unknown): FieldRecord[] {
  const x = value as any;
  if (
    x?.type !== "FeatureCollection" ||
    !Array.isArray(x.features) ||
    x.features.length > 2000
  )
    throw Error(
      "Import a GeoJSON FeatureCollection with at most 2,000 field features.",
    );
  const ids = new Set<string>();
  return x.features.map((f: any, i: number) => {
    const p = f.properties || {},
      g = f.geometry;
    let geometry: FieldRecord["geometry"];
    if (g?.type === "Point")
      geometry = { type: "Point", coordinates: validatePoint(g.coordinates) };
    else if (
      g?.type === "LineString" &&
      Array.isArray(g.coordinates) &&
      g.coordinates.length >= 2 &&
      g.coordinates.length <= 5000
    )
      geometry = {
        type: "LineString",
        coordinates: g.coordinates.map(validatePoint),
      };
    else if (g?.type === "Polygon") geometry = parsePolygon(g);
    else throw Error(`Feature ${i + 1}: use Point, LineString or Polygon.`);
    const name = String(p.species || p.name || "").trim(),
      date = String(p.date || ""),
      observer = String(p.observer || "").trim();
    if (
      geometry.type !== "Point" &&
      (!String(p.method || "").trim() || !String(p.effort || "").trim())
    )
      throw Error(
        `Feature ${i + 1}: survey geometry requires method and effort.`,
      );
    if (
      !name ||
      !observer ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw Error(
        `Feature ${i + 1}: name/species, observer and date (YYYY-MM-DD) are required.`,
      );
    if (p.sensitive !== undefined && ![true, false, "true", "false"].includes(p.sensitive)) throw Error(`Feature ${i + 1}: sensitivity must be true or false.`);
    const id = String(f.id || p.id || crypto.randomUUID());
    if (ids.has(id)) throw Error("Duplicate field IDs in import.");
    ids.add(id);
    return {
      id,
      name,
      geometry,
      date,
      observer,
      kind:
        geometry.type === "LineString"
          ? "Survey track"
          : geometry.type === "Polygon"
            ? "Survey area"
            : ["Observation", "Burrow / sign", "Nest"].includes(p.kind)
              ? p.kind
              : "Observation",
      method: String(p.method || ""),
      effort: String(p.effort || ""),
      notes: String(p.notes || ""),
      photo: String(p.photo || ""),
      sensitive: p.sensitive !== false && p.sensitive !== "false",
    };
  });
}
export const storageKey = "wildscape-screening-v1";
export function persist(projects: Project[]) {
  localStorage.setItem(storageKey, JSON.stringify(projects));
}
export function restoreProject(x: unknown): Project {
  const p = x as Project;
  if (
    p?.schema !== 1 ||
    p.world !== "mojave-001" ||
    typeof p.name !== "string" ||
    !Array.isArray(p.field) ||
    !Array.isArray(p.candidates) ||
    !p.reviews ||
    !Array.isArray(p.history)
  )
    throw Error("Unsupported or incomplete Wildscape project backup.");
  for (const key of [
    "id",
    "client",
    "reference",
    "purpose",
    "since",
    "created",
    "updated",
    "notes",
    "reviewer",
    "agencyNotes",
  ] as const)
    if (typeof p[key] !== "string")
      throw Error("Incomplete project metadata: " + key);
  if (
    !Number.isInteger(p.revision) ||
    p.revision < 1 ||
    !["Draft", "Reviewed"].includes(p.status)
  )
    throw Error("Invalid project revision or status.");
  if (p.aoi) p.aoi = parsePolygon(p.aoi);
  if (!Number.isFinite(p.buffer) || p.buffer < 0 || p.buffer > 10000)
    throw Error("Invalid search distance.");
  for (const r of Object.values(p.reviews)) validateReview(r);
  p.field = parseField({
    type: "FeatureCollection",
    features: p.field.map((f) => ({
      type: "Feature",
      id: f.id,
      geometry: f.geometry,
      properties: { ...f, species: f.name },
    })),
  });
  for (const c of p.candidates)
    if (!c.name || !c.reason || !c.source)
      throw Error("Candidate references are incomplete.");
  return p;
}
export function loadProjects(): Project[] {
  const text = localStorage.getItem(storageKey);
  if (!text) return [];
  const value = JSON.parse(text);
  if (!Array.isArray(value))
    throw Error(
      "Saved projects are invalid. Export browser storage before resetting.",
    );
  return value.map(restoreProject);
}
