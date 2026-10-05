import type { Mode } from "../data/types";
export type Phase =
  | "GLOBE"
  | "WORLD_LOADING"
  | "WORLD"
  | "SPECIES_SELECTED"
  | "OCCURRENCE_SELECTED"
  | "LOCATION_QUERY";
export interface AppState {
  phase: Phase;
  world: string | null;
  species: string | null;
  occurrence: string | null;
  mode: Mode;
  group: string;
  search: string;
  evidence: "all" | "standard" | "historical";
}
export class State {
  value: AppState = {
    phase: "GLOBE",
    world: null,
    species: null,
    occurrence: null,
    mode: "WORLD",
    group: "All",
    search: "",
    evidence: "all",
  };
  private listeners = new Set<(s: AppState) => void>();
  set(patch: Partial<AppState>) {
    this.value = { ...this.value, ...patch };
    for (const fn of this.listeners) fn(this.value);
  }
  subscribe(fn: (s: AppState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
