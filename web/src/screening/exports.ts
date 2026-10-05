import type { Pack, Project, ScreeningRow, HabitatSummary } from "./types";
import { areaHa } from "./geo";
import { issues } from "./model";
import { csv, esc, fmt, link } from "./utils";
export function speciesCSV(rows: ScreeningRow[]) {
  return csv([
    [
      "Scientific name",
      "Common name",
      "Group",
      "Candidate basis",
      "Literature source",
      "In footprint (uncertainty contained)",
      "Near footprint",
      "Uncertain records",
      "Field entries",
      "Latest public record",
      "Decision",
      "Rationale",
      "Next action",
      "Reviewer",
      "Reviewed at",
    ],
    ...rows.map((r) => [
      r.name,
      r.common,
      r.group,
      r.candidate?.reason || "Occurrence evidence",
      r.candidate?.source || "",
      r.inside,
      r.nearby,
      r.uncertain,
      r.fieldCount,
      r.latest,
      r.review.decision,
      r.review.rationale,
      r.review.action,
      r.review.reviewer,
      r.review.updated,
    ]),
  ]);
}
export function evidenceCSV(rows: ScreeningRow[]) {
  return csv([
    [
      "Species",
      "Public record ID",
      "Date",
      "Longitude (public)",
      "Latitude (public)",
      "Coordinate uncertainty m",
      "Generalization m",
      "Sensitive/generalized",
      "Provider",
      "Dataset attribution",
      "Record attribution",
      "License",
    ],
    ...rows.flatMap((r) =>
      r.records.map((o) => [
        r.name,
        o.id,
        o.event_date,
        o.longitude,
        o.latitude,
        o.uncertainty_m,
        o.generalization_m,
        o.is_sensitive || o.is_obscured,
        o.source,
        `https://www.gbif.org/dataset/${o.source_dataset}`,
        o.source_url || "Withheld for sensitive record",
        o.license,
      ]),
    ),
  ]);
}
export function projectGeoJSON(p: Project, rows: ScreeningRow[]) {
  return {
    type: "FeatureCollection",
    name: p.name,
    properties: {
      project_id: p.id,
      revision: p.revision,
      source_world: p.world,
      search_distance_m: p.buffer,
      method:
        "Public occurrence positions are uncertain; point-in-polygon is not evidence of occupancy.",
      sensitive_field_features_omitted: p.field.filter((f) => f.sensitive)
        .length,
    },
    features: [
      ...(p.aoi
        ? [
            {
              type: "Feature",
              geometry: p.aoi,
              properties: {
                feature_type: "project_boundary",
                name: p.name,
                example: p.example,
              },
            },
          ]
        : []),
      ...rows.flatMap((r) =>
        r.records.map((o) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [o.longitude, o.latitude] },
          properties: {
            feature_type: "public_occurrence",
            species: r.name,
            date: o.event_date,
            uncertainty_m: o.uncertainty_m,
            generalization_m: o.generalization_m,
            sensitive: o.is_sensitive,
            license: o.license,
            source_url: o.source_url || "",
            source_dataset: o.source_dataset,
          },
        })),
      ),
      ...p.field
        .filter((f) => !f.sensitive)
        .map((f) => ({
          type: "Feature",
          id: f.id,
          geometry: f.geometry,
          properties: {
            feature_type: "field_evidence",
            species: f.name,
            date: f.date,
            observer: f.observer,
            method: f.method,
            effort: f.effort,
            kind: f.kind,
            notes: f.notes,
            photo: f.photo,
            sensitive: false,
          },
        })),
    ],
  };
}
export function report(
  p: Project,
  pack: Pack,
  rows: ScreeningRow[],
  habitat: HabitatSummary[],
  mapSVG: string,
) {
  const pending = issues(p, pack, rows),
    reviewed =
      p.status === "Reviewed" &&
      p.reviewedRevision === p.revision &&
      pending.length === 0;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.name)} · screening report</title><style>body{font:14px/1.55 Arial,sans-serif;color:#203730;max-width:1100px;margin:40px auto;padding:0 24px}h1{font-size:32px}h2{border-top:1px solid #bbb;padding-top:20px;margin-top:30px}table{border-collapse:collapse;width:100%;font-size:11px}td,th{padding:7px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#edf2ee}a{color:#146456}small{color:#5f6d66}.tag{background:#f3e6b9;padding:6px 12px;display:inline-block}.map{background:#26382f;max-width:700px;margin:auto}.map svg{width:100%;height:auto;display:block}.draw-tip,.map-scale,.map-north{display:none}button{padding:10px}@media print{button{display:none}body{margin:0;max-width:none}tr{break-inside:avoid}a{overflow-wrap:anywhere}.map{max-height:450px;max-width:450px}h2{break-after:avoid}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><p>WILDSCAPE / HABITAT & SPECIES SCREENING</p><h1>${esc(p.name)}</h1><p class="tag">${reviewed ? "CONSULTANT REVIEW RECORDED" : "DRAFT · REVIEW INCOMPLETE"}${p.example ? " · EXAMPLE FOOTPRINT" : ""}</p><p>Client: ${esc(p.client || "Unspecified")} · Reference: ${esc(p.reference || "—")} · Reviewer: ${esc(p.reviewer || "Unassigned")}</p><p>Project ${esc(p.id)} · Revision ${p.revision} · Generated ${esc(new Date().toISOString())}</p><p>${esc(p.purpose)}</p><h2>Scope and screening parameters</h2><p>Footprint: ${p.aoi ? fmt(areaHa(p.aoi)) : "Not defined"} ha. Search distance: ${fmt(p.buffer)} m from polygon edges, in EPSG:32611. Earliest record: ${esc(p.since || "No date filter")}. Undated records are excluded when a date filter is set. Source coverage: ${esc(pack.manifest.name)}. This screen is not an official agency species list or a determination of occupancy, absence, or regulatory clearance.</p>${pending.length ? `<h2>Outstanding review items</h2><ul>${pending.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<h2>Project map</h2><p>Portable vector overview without imagery: matching public occurrences and non-sensitive field evidence only. Coordinates and area calculations use UTM zone 11N. Mint circles: public records; violet outlines: generalized positions; yellow: footprint and search context; orange: field evidence. Search outline is illustrative.</p><div class="map">${mapSVG}</div><h2>Habitat interpretation</h2><p>${esc(p.notes || "No interpretation recorded.").replaceAll("\n", "<br>")}</p>${habitat.map((h) => `<h3>${esc(h.layer)}</h3><p>Approximate pixel-center accounting: ${h.totalCells} sampled cells, ${h.nodata} NoData cells; ${fmt(h.cellHa, 3)} ha per cell. Partial boundary cells are not fractionally weighted. Small sites and edge features require finer evidence.</p><table><tr><th>Class</th><th>Area (ha)</th><th>Sampled footprint (%)</th></tr>${h.classes.map((c) => `<tr><td>${esc(c.label)}</td><td>${fmt(c.ha)}</td><td>${fmt(c.percent)}</td></tr>`).join("")}</table>`).join("")}<h2>Species screening (${rows.length})</h2><p>Uncertain records include generalized positions, boundary overlap, and unreported coordinate uncertainty. Candidate references are provisional regional context and require geographic review. Missing records do not indicate absence. Field counts indicate submitted evidence, not verified identifications.</p><table><tr><th>Species / evidence</th><th>Decision</th><th>Rationale and next action</th><th>Review</th></tr>${rows.map((r) => `<tr><td><b>${esc(r.name)}</b><br>${esc(r.common)}<br>${r.records.length} public records · ${r.uncertain} uncertain · ${r.fieldCount} field entries${r.candidate ? "<br>" + link(r.candidate.source, r.candidate.sourceTitle) : ""}</td><td>${esc(r.review.decision)}</td><td>${esc(r.review.rationale)}<br>${esc(r.review.action)}</td><td>${esc(r.review.reviewer)}<br>${esc(r.review.updated)}</td></tr>`).join("")}</table><h2>Field evidence</h2><p>${p.field.length} entries held in the project; ${p.field.filter((f) => f.sensitive).length} sensitive entries omitted from this report. Survey tracks describe submitted effort, not validated protocol coverage.</p><table><tr><th>Type / name</th><th>Date / observer</th><th>Method / effort</th><th>Notes</th></tr>${p.field
    .filter((f) => !f.sensitive)
    .map(
      (f) =>
        `<tr><td>${esc(f.kind)} · ${esc(f.name)}</td><td>${esc(f.date)} · ${esc(f.observer)}</td><td>${esc(f.method)} · ${esc(f.effort)}</td><td>${esc(f.notes)}</td></tr>`,
    )
    .join(
      "",
    )}</table><h2>Agency and regional checks</h2><p>${esc(p.agencyNotes || "Not documented.").replaceAll("\n", "<br>")}</p><h2>Methods and data provenance</h2><p>Pack built ${esc(pack.created_at)}; source manifest SHA-256 ${esc(pack.manifest_sha256)}. World build ${esc(pack.manifest.built_at)}. ${pack.records.length} CC0/CC BY public records included; ${Object.values(pack.excluded_licenses).reduce((a, b) => a + b, 0)} records excluded by license. Source image acquisition dates vary and are not established for each exported imagery tile. DEM spacing approximately 15 m; habitat pack spacing approximately 31 m from nominal 30 m LANDFIRE products. BpS is potential vegetation, not current habitat. Current plant locations are not inferred from decorative vegetation.</p><ul>${pack.notes.map((n) => `<li>${esc(n)}</li>`).join("")}${pack.layers.map((l) => `<li>${esc(l.title)}: ${esc(l.note)} ${link(l.source, "Source")}</li>`).join("")}</ul><h3>Occurrence attribution</h3><p>See the accompanying evidence CSV for per-record source, dataset, license and uncertainty. Record links are omitted for sensitive observations.</p><ul>${[...new Set(rows.flatMap((r) => r.records.map((o) => o.source_dataset)))].map((id) => `<li>${link("https://www.gbif.org/dataset/" + id, "GBIF dataset " + id)}</li>`).join("")}</ul><h2>Project history</h2><table>${p.history.map((h) => `<tr><td>${esc(h.date)}</td><td>${esc(h.action)}</td></tr>`).join("")}</table></body></html>`;
}
