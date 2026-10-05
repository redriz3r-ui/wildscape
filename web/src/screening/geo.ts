import proj4 from "proj4";
import type { XY, Polygon, HabitatLayer, HabitatSummary } from "./types";
proj4.defs("EPSG:32611", "+proj=utm +zone=11 +datum=WGS84 +units=m +no_defs");
export const project = (p: XY): XY => proj4("EPSG:4326", "EPSG:32611", p) as XY;
export const geographic = (p: XY): XY =>
  proj4("EPSG:32611", "EPSG:4326", p) as XY;
export const ringArea = (r: XY[]) =>
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length];
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2,
  );
export const areaHa = (p: Polygon) =>
  (ringArea(p.coordinates[0].map(project)) -
    p.coordinates.slice(1).reduce((s, r) => s + ringArea(r.map(project)), 0)) /
  10000;
function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = dx * dx + dy * dy;
  const t = len
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function inRing(p: XY, r: XY[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i],
      b = r[j];
    if (segmentDistance(p, a, b) < 1e-8) return true;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export const inPolygon = (p: XY, rings: XY[][]) =>
  inRing(p, rings[0]) && !rings.slice(1).some((r) => inRing(p, r));
export function boundaryDistance(p: XY, rings: XY[][]) {
  let d = Infinity;
  for (const r of rings)
    for (let i = 1; i < r.length; i++)
      d = Math.min(d, segmentDistance(p, r[i - 1], r[i]));
  return d;
}
export const distanceTo = (p: XY, rings: XY[][]) =>
  inPolygon(p, rings) ? 0 : boundaryDistance(p, rings);
function crosses(a: XY, b: XY, c: XY, d: XY) {
  const cross = (p: XY, q: XY, r: XY) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const x = cross(a, b, c),
    y = cross(a, b, d),
    z = cross(c, d, a),
    w = cross(c, d, b);
  return (
    x * y <= 0 &&
    z * w <= 0 &&
    Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
      Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) &&
    Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
      Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1]))
  );
}
export function validatePoint(p: unknown): XY {
  if (
    !Array.isArray(p) ||
    p.length < 2 ||
    !p.slice(0, 2).every((x) => typeof x === "number" && Number.isFinite(x)) ||
    Math.abs(p[0]) > 180 ||
    Math.abs(p[1]) > 85
  )
    throw Error(
      "Coordinates must be WGS84 longitude, latitude in decimal degrees.",
    );
  return [p[0], p[1]];
}
export function parsePolygon(value: unknown): Polygon {
  let x = value as any;
  if (x?.crs)
    throw Error(
      "Remove the legacy CRS member and reproject to WGS84 before importing.",
    );
  if (x?.type === "FeatureCollection") {
    if (x.features?.length !== 1)
      throw Error("Import one polygon feature for the project boundary.");
    x = x.features[0];
  }
  if (x?.type === "Feature") x = x.geometry;
  if (
    x?.type !== "Polygon" ||
    !Array.isArray(x.coordinates) ||
    !x.coordinates.length ||
    x.coordinates.length > 100
  )
    throw Error(
      "Use a GeoJSON Polygon (holes supported), or a single polygon Feature.",
    );
  const rings: XY[][] = x.coordinates.map((r: unknown) => {
    if (!Array.isArray(r) || r.length < 4 || r.length > 5000)
      throw Error("Each ring needs 4–5,000 coordinates.");
    const ring = r.map(validatePoint);
    if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1])
      throw Error("Polygon rings must close at their starting coordinate.");
    for (let i = 0; i < ring.length - 1; i++)
      for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        if (crosses(ring[i], ring[i + 1], ring[j], ring[j + 1]))
          throw Error("Polygon has crossing or touching edges.");
      }
    return ring;
  });
  for (let i = 1; i < rings.length; i++) {
    if (!rings[i].slice(0, -1).every((p) => inRing(p, rings[0])))
      throw Error("Holes must lie inside the outer boundary.");
    for (let j = 0; j < i; j++) {
      for (let a = 1; a < rings[i].length; a++)
        for (let b = 1; b < rings[j].length; b++)
          if (
            crosses(rings[i][a - 1], rings[i][a], rings[j][b - 1], rings[j][b])
          )
            throw Error("Polygon rings cannot intersect.");
      if (
        j > 0 &&
        (inRing(rings[i][0], rings[j]) || inRing(rings[j][0], rings[i]))
      )
        throw Error("Holes cannot overlap.");
    }
  }
  const result: Polygon = { type: "Polygon", coordinates: rings };
  if (areaHa(result) < 0.01)
    throw Error("Project boundary must cover at least 100 square metres.");
  return result;
}
export function bboxPolygon(
  w: number,
  s: number,
  e: number,
  n: number,
): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}
export function coverage(p: Polygon, bbox: number[], buffer: number) {
  const region = bboxPolygon(
    bbox[0],
    bbox[1],
    bbox[2],
    bbox[3],
  ).coordinates.map((r) => r.map(project));
  const outside = p.coordinates[0].some(
    ([x, y]) => x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3],
  );
  const edge =
    outside ||
    p.coordinates[0]
      .map(project)
      .some((xy) => boundaryDistance(xy, region) < buffer);
  return { outside, edge };
}
export function summarizeHabitat(
  aoi: Polygon,
  layer: HabitatLayer,
): HabitatSummary {
  const rings = aoi.coordinates.map((r) => r.map(project)),
    [w, s, e, n] = layer.bounds,
    N = layer.size,
    dx = (e - w) / N,
    dy = (n - s) / N,
    counts = new Map<number, number>();
  let totalCells = 0,
    nodata = 0;
  const xs = rings[0].map((p) => p[0]),
    ys = rings[0].map((p) => p[1]);
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - w) / dx)),
    c1 = Math.min(N - 1, Math.ceil((Math.max(...xs) - w) / dx)),
    r0 = Math.max(0, Math.floor((n - Math.max(...ys)) / dy)),
    r1 = Math.min(N - 1, Math.ceil((n - Math.min(...ys)) / dy));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      if (!inPolygon([w + (c + 0.5) * dx, n - (r + 0.5) * dy], rings)) continue;
      totalCells++;
      const code = layer.values?.[r * N + c] ?? -9999;
      if (code === -9999) {
        nodata++;
        continue;
      }
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  return {
    layer: layer.title,
    totalCells,
    nodata,
    cellHa: (dx * dy) / 10000,
    classes: [...counts]
      .map(([code, cells]) => {
        const l = layer.legend.find((l) => l.code === code);
        return {
          code,
          label: l?.label || String(code),
          color: l?.color || "#aaa",
          cells,
          ha: (cells * dx * dy) / 10000,
          percent: totalCells ? (cells / totalCells) * 100 : 0,
        };
      })
      .sort((a, b) => b.cells - a.cells),
  };
}
