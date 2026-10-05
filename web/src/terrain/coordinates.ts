import proj4 from "proj4";
import type { TerrainMeta } from "../data/types";
export class Coordinates {
  constructor(public meta: TerrainMeta) {
    const code = Number(meta.crs.split(":")[1]);
    if (!proj4.defs(meta.crs)) {
      if (code < 32601 || code > 32760)
        throw new Error("World requires a supported projected CRS definition");
      proj4.defs(
        meta.crs,
        `+proj=utm +zone=${code % 100} ${code >= 32700 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`,
      );
    }
  }
  toScene(
    lon: number,
    lat: number,
    elevation: number = 0,
  ): [number, number, number] {
    const [e, n] = proj4("EPSG:4326", this.meta.crs, [lon, lat]);
    const o = this.meta.origin;
    return [e - o[0], elevation - o[2], o[1] - n];
  }
  toGeo(x: number, y: number, z: number): [number, number, number] {
    const o = this.meta.origin;
    const [lon, lat] = proj4(this.meta.crs, "EPSG:4326", [x + o[0], o[1] - z]);
    return [lon, lat, y + o[2]];
  }
  sample(data: Float32Array, n: number, x: number, z: number): number | null {
    const [w, s, e, t] = this.meta.grid_bounds,
      o = this.meta.origin;
    const u = ((x + o[0] - w) / (e - w)) * (n - 1),
      v = ((t - (o[1] - z)) / (t - s)) * (n - 1);
    if (u < 0 || v < 0 || u > n - 1 || v > n - 1) return null;
    const a = Math.floor(u),
      b = Math.floor(v),
      c = Math.min(n - 1, a + 1),
      d = Math.min(n - 1, b + 1),
      fx = u - a,
      fy = v - b;
    return (
      (1 - fy) * ((1 - fx) * data[b * n + a] + fx * data[b * n + c]) +
      fy * ((1 - fx) * data[d * n + a] + fx * data[d * n + c]) -
      o[2]
    );
  }
}
