import type { SunSettings, SunStats } from "../terrain/sun";
import type { WorldData, Mode, Observation } from "../data/types";
export interface RendererEvents {
  onOccurrence: (record: Observation) => void;
  onLocation: (lon: number, lat: number) => void;
  onScale: (label: string) => void;
  onStatus: (message: string) => void;
}
export interface LocalWorldRenderer {
  readonly name: string;
  mount(
    element: HTMLDivElement,
    data: WorldData,
    events: RendererEvents,
  ): Promise<void>;
  setMode(mode: Mode): Promise<void>;
  setSun(settings: SunSettings): Promise<SunStats | undefined>;
  setRecords(records: Observation[], selected: string | null): void;
  fit(records: Observation[]): Promise<void>;
  flyTo(record: Observation): Promise<void>;
  home(): Promise<void>;
  zoom(factor: number): void;
  queryCenter(): void;
  dispose(): void;
}
