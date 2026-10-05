import type {
  WorldData,
  Manifest,
  Species,
  Observation,
  Placement,
  VegetationMeta,
  Detail,
} from "./types";
export async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
  return r.json() as Promise<T>;
}
export async function floats(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Terrain unavailable (${r.status})`);
  return new Float32Array(await r.arrayBuffer());
}
export async function loadWorld(
  id: string,
  signal: AbortSignal,
): Promise<WorldData> {
  const base = `/worlds/${encodeURIComponent(id)}/`;
  const manifest = await json<Manifest>(base + "manifest.json", signal);
  const a = manifest.assets;
  const [species, observations, elevation, placements, vegetation] =
    await Promise.all([
      json<Species[]>(base + a.species, signal),
      json<Observation[]>(base + a.observations, signal),
      floats(base + a.elevation_low, signal),
      json<Placement[]>(base + a.vegetation, signal),
      json<VegetationMeta>(base + a.vegetation_metadata, signal),
    ]);
  return {
    base,
    manifest,
    species,
    observations,
    elevation,
    placements,
    vegetation,
  };
}
export const loadDetail = (base: string, id: string) =>
  json<Detail>(`${base}observations/detail/${encodeURIComponent(id)}.json`);
