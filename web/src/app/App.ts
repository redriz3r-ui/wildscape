import { State } from "./State";
import { json, loadWorld, loadDetail } from "../data/load";
import type {
  WorldSummary,
  WorldData,
  Species,
  Observation,
  Mode,
} from "../data/types";
import type { LocalWorldRenderer } from "../world/LocalWorldRenderer";
import { SpatialIndex } from "../wildlife/spatial";

const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const date = (s: string | null) => (s ? s.slice(0, 10) : "Date unavailable");
const years = (s: Species) =>
  `${s.first_record?.slice(0, 4) || "—"} — ${s.last_record?.slice(0, 4) || "—"}`;
const icons: Record<string, string> = {
  Plants: "✳",
  Birds: "⌁",
  Mammals: "◈",
  Reptiles: "◇",
  Arthropods: "✣",
  Amphibians: "◌",
  Other: "·",
};
export class App {
  readonly state = new State();
  private host: HTMLElement;
  private scene!: HTMLDivElement;
  private worlds: WorldSummary[] = [];
  private world?: WorldData;
  private globe?: Awaited<
    ReturnType<typeof import("../globe/GlobeView").mountGlobe>
  >;
  private renderer?: LocalWorldRenderer;
  private abort?: AbortController;
  private spatial?: SpatialIndex;
  private point: [number, number] | null = null;
  private generation = 0;
  constructor(host: HTMLElement) {
    this.host = host;
  }
  async start() {
    this.host.innerHTML = `<main id="experience"><div id="scene" aria-label="Geographic scene"></div>
   <header><button class="brand" id="back" aria-label="Return to Earth"><span class="brand-mark">W</span> WILDSCAPE</button><span id="world-label">A FIELD GUIDE TO THE LIVING EARTH</span></header>
   <div id="fixture-label" hidden>DEMONSTRATION · SYNTHETIC DATA</div>
   <section id="globe-ui" aria-label="Available worlds"><div class="eyebrow">LANDSCAPES, ALIVE WITH EVIDENCE</div><h1>A world to<br>look closer.</h1><p>Explore the terrain.<br>Discover the life recorded within it.</p><div id="world-cards"></div><span class="subtle">Drag to rotate Earth · Scroll to explore</span></section>
   <aside id="guide" hidden aria-label="Species explorer"><div class="panel-heading"><span class="eyebrow">FIELD GUIDE</span><button id="collapse-guide" aria-label="Collapse species explorer">−</button></div><h2>Life in this landscape</h2><div id="guide-counts"></div>
    <label class="search"><span>⌕</span><input id="search" type="search" placeholder="Find a species…" aria-label="Find a species"></label>
    <div class="filter-row"><select id="group" aria-label="Taxonomic group"><option>All</option></select><select id="evidence" aria-label="Evidence type"><option value="all">All evidence</option><option value="standard">Recent observations</option><option value="historical">Historical evidence</option></select></div><button id="clear-species" class="text-button" hidden>Clear species selection</button><div id="species-list"></div>
    <p class="guide-foot">Recorded evidence, not a complete inventory.</p></aside>
   <button id="open-guide" class="float-button" hidden>Field guide</button>
   <aside id="detail" hidden aria-live="polite"></aside>
   <div id="world-controls" hidden><details id="sun-controls" class="sun-controls"><summary>☀ Sun & shadows</summary><label><input id="sun-enabled" type="checkbox"> Sun lighting</label><label>Direction <output id="sun-bearing">315° NW</output><input id="sun-azimuth" aria-label="Sun direction" type="range" min="0" max="359" value="315"></label><label>Height above horizon <output id="sun-height">35°</output><input id="sun-altitude" aria-label="Sun height" type="range" min="5" max="85" value="35"></label><label><input id="sun-shadows" type="checkbox" checked> Terrain cast shadows</label><p id="sun-stats" aria-live="polite">Choose sun lighting to model light and shade.</p><p class="small muted">Direction is clockwise from grid north. Shadows use the DEM within this landscape; trees, buildings and terrain beyond its edge are excluded.</p><p id="raster-detail" class="small muted"></p></details><div class="view-tools"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="home" aria-label="Reset landscape view">⌂</button></div>
    <div class="bottom-center"><button id="query-center" class="query-button">⌖ &nbsp; What’s been found here?</button><nav class="modes" aria-label="Landscape visualization">${(["WORLD", "AERIAL", "VEGETATION", "ELEVATION", "SPECIES"] as Mode[]).map((m) => `<button data-mode="${m}" aria-pressed="${m === "WORLD"}">${m.charAt(0) + m.slice(1).toLowerCase()}</button>`).join("")}</nav><span id="mode-caption">Terrain · imagery · ecological context</span></div><div class="compass" aria-hidden="true">N<br><span>↑</span></div>
   </div><footer><span id="scene-caption">EARTH / EXPLORE A WILDSCAPE</span><button id="sources">Data & sources ↗</button></footer>
   <div id="loading" hidden role="status"><div class="loading-mark">W</div><h2>Entering the landscape</h2><p id="loading-text">Preparing terrain and recorded evidence…</p></div>
   <div id="status" role="status" hidden></div><dialog id="sources-dialog" aria-labelledby="sources-title"><button id="close-sources" class="close" aria-label="Close data sources">×</button><div id="source-content"></div></dialog>
   </main>`;
    this.scene = this.el<HTMLDivElement>("scene");
    for (const id of [
      "sun-enabled",
      "sun-azimuth",
      "sun-altitude",
      "sun-shadows",
    ]) {
      this.el(id).addEventListener("change", () => void this.updateSun());
    }
    for (const id of ["sun-azimuth", "sun-altitude"])
      this.el(id).addEventListener("input", () => this.sunLabels());
    this.el("back").onclick = () => void this.showGlobe();
    this.el("sources").onclick = () => void this.showSources();
    this.el("close-sources").onclick = () =>
      this.el<HTMLDialogElement>("sources-dialog").close();
    this.el("search").addEventListener("input", (e) => {
      this.state.set({ search: (e.target as HTMLInputElement).value });
      this.renderSpecies();
      this.applyRecords();
    });
    this.el("group").addEventListener("change", (e) => {
      this.state.set({
        group: (e.target as HTMLSelectElement).value,
        species: null,
      });
      this.renderSpecies();
      this.applyRecords();
    });
    this.el("evidence").addEventListener("change", (e) => {
      this.state.set({
        evidence: (e.target as HTMLSelectElement).value as
          | "all"
          | "standard"
          | "historical",
      });
      this.renderSpecies();
      this.applyRecords();
    });
    this.el("clear-species").onclick = () => {
      this.state.set({ species: null, occurrence: null, phase: "WORLD" });
      this.el("detail").hidden = true;
      this.renderSpecies();
      this.applyRecords();
    };
    this.el("collapse-guide").onclick = () => {
      this.el("guide").hidden = true;
      this.el("open-guide").hidden = false;
    };
    this.el("open-guide").onclick = () => {
      this.el("guide").hidden = false;
      this.el("open-guide").hidden = true;
    };
    this.el("home").onclick = () => void this.renderer?.home();
    this.el("zoom-in").onclick = () => this.renderer?.zoom(0.7);
    this.el("zoom-out").onclick = () => this.renderer?.zoom(1.4);
    this.el("query-center").onclick = () => this.renderer?.queryCenter();
    this.host
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach(
        (b) => (b.onclick = () => void this.setMode(b.dataset.mode as Mode)),
      );
    try {
      this.worlds = await json<WorldSummary[]>("/worlds/index.json");
      await this.showGlobe();
    } catch (e) {
      this.status(
        `Could not open Wildscape: ${String(e)}. Build a world with make all, then reload.`,
        true,
      );
    }
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.host.querySelector<T>("#" + id)!;
  }
  private status(text: string, persist = false) {
    const box = this.el("status");
    box.textContent = text;
    box.hidden = false;
    if (!persist) setTimeout(() => (box.hidden = true), 6000);
  }
  private async showGlobe() {
    const token = ++this.generation;
    this.abort?.abort();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.globe?.dispose();
    this.globe = undefined;
    this.world = undefined;
    this.state.set({
      phase: "GLOBE",
      world: null,
      species: null,
      occurrence: null,
      search: "",
      group: "All",
      evidence: "all",
    });
    for (const id of [
      "guide",
      "open-guide",
      "detail",
      "world-controls",
      "fixture-label",
      "loading",
    ])
      this.el(id).hidden = true;
    this.el("globe-ui").hidden = false;
    this.el("world-label").textContent = "A FIELD GUIDE TO THE LIVING EARTH";
    this.el("scene-caption").textContent = "EARTH / EXPLORE A WILDSCAPE";
    this.el("world-cards").innerHTML = this.worlds
      .map(
        (w, i) =>
          `<button class="world-card" data-world="${escape(w.id)}"><span class="eyebrow">WORLD ${String(i + 1).padStart(3, "0")} <span>${w.fixture ? "FIXTURE DEMO" : "AVAILABLE"}</span></span><strong>${escape(w.name)}</strong><span class="world-card-bottom">${w.species_count} species · ${w.occurrence_count} records <b>Explore ↗</b></span></button>`,
      )
      .join("");
    this.host
      .querySelectorAll<HTMLButtonElement>("[data-world]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            void this.enter(
              this.worlds.find((w) => w.id === b.dataset.world)!,
            )),
      );
    const { mountGlobe } = await import("../globe/GlobeView");
    if (token !== this.generation) return;
    this.globe = await mountGlobe(
      this.scene,
      this.worlds,
      (w) => void this.enter(w),
    );
  }
  private sunLabels() {
    this.el("sun-bearing").textContent =
      this.el<HTMLInputElement>("sun-azimuth").value + "°";
    this.el("sun-height").textContent =
      this.el<HTMLInputElement>("sun-altitude").value + "°";
  }
  private sunVersion = 0;
  private async updateSun() {
    const renderer = this.renderer;
    if (!renderer) return;
    const version = ++this.sunVersion;
    this.sunLabels();
    const enabled = this.el<HTMLInputElement>("sun-enabled").checked;
    this.el("sun-stats").textContent = enabled
      ? "Calculating terrain shadows…"
      : "Sun lighting off.";
    const stats = await renderer.setSun({
      enabled,
      azimuth: Number(this.el<HTMLInputElement>("sun-azimuth").value),
      altitude: Number(this.el<HTMLInputElement>("sun-altitude").value),
      shadows: this.el<HTMLInputElement>("sun-shadows").checked,
    });
    if (stats && version === this.sunVersion && renderer === this.renderer)
      this.el("sun-stats").textContent =
        `${stats.shadowKm2.toFixed(2)} km² (${stats.shadowPercent.toFixed(1)}%) in terrain cast shadow · approximate ${stats.cellMeters.toFixed(0)} m analysis grid.`;
  }
  private async enter(summary: WorldSummary) {
    if (this.state.value.phase === "WORLD_LOADING") return;
    const token = ++this.generation;
    this.abort = new AbortController();
    this.state.set({ phase: "WORLD_LOADING", world: summary.id });
    this.el("loading").hidden = false;
    this.el("globe-ui").hidden = true;
    try {
      const [data] = await Promise.all([
        loadWorld(summary.id, this.abort.signal),
        this.globe?.focus(summary),
      ]);
      if (token !== this.generation) return;
      this.globe?.dispose();
      this.globe = undefined;
      this.world = data;
      this.spatial = new SpatialIndex(data.observations);
      const events = {
        onOccurrence: (r: Observation) => void this.selectOccurrence(r),
        onLocation: (lon: number, lat: number) => this.queryLocation(lon, lat),
        onScale: (s: string) => {
          this.el("scene-caption").textContent =
            `${s.toUpperCase()} / ${data.manifest.terrain.elevation_min.toFixed(0)}–${data.manifest.terrain.elevation_max.toFixed(0)} M`;
        },
        onStatus: (s: string) => this.status(s),
      };
      const { ITownsWorldRenderer } = await import(
        "../world/ITownsWorldRenderer"
      );
      if (token !== this.generation) return;
      this.renderer = new ITownsWorldRenderer();
      await this.renderer.mount(this.scene, data, events);
      if (token !== this.generation) return;
      this.el("loading").hidden = true;
      this.el("guide").hidden = false;
      this.el("world-controls").hidden = false;
      this.el("fixture-label").hidden = !summary.fixture;
      this.el<HTMLInputElement>("sun-enabled").checked = false;
      this.el("sun-stats").textContent =
        "Choose sun lighting to model light and shade.";
      const pyramid = data.manifest.imagery_pyramid;
      this.el("raster-detail").textContent = pyramid
        ? `Imagery refines as you zoom, down to ${pyramid.meters_per_pixel.toFixed(1)} m/pixel. DEM grid: ${(data.manifest.terrain.width_m / (data.manifest.terrain.size - 1)).toFixed(0)} m. Source detail varies.`
        : "This fixture uses a single demonstration image.";
      this.el("world-label").textContent = summary.name;
      this.el("guide-counts").innerHTML =
        `<strong>${data.manifest.species_count}</strong> species <span>·</span> <strong>${data.manifest.occurrence_count}</strong> records`;
      this.el<HTMLSelectElement>("group").innerHTML =
        "<option>All</option>" +
        [...new Set(data.species.map((s) => s.group))]
          .sort()
          .map((g) => `<option>${escape(g)}</option>`)
          .join("");
      this.el<HTMLInputElement>("search").value = "";
      this.el<HTMLSelectElement>("evidence").value = "all";
      this.state.set({
        phase: "WORLD",
        mode: "WORLD",
        species: null,
        search: "",
        group: "All",
        evidence: "all",
      });
      this.renderSpecies();
      this.applyRecords();
      this.scene.dataset.renderer = this.renderer.name;
      this.scene.dataset.loaded = "true";
    } catch (e) {
      if (token !== this.generation) return;
      this.el("loading").hidden = true;
      this.status(
        `Landscape could not load: ${String(e)}. Return to Earth to retry.`,
        true,
      );
    }
  }
  private filteredSpecies() {
    const s = this.state.value;
    return this.world!.species.filter(
      (t) =>
        (s.group === "All" || t.group === s.group) &&
        `${t.name} ${t.common_name}`
          .toLowerCase()
          .includes(s.search.toLowerCase()),
    );
  }
  private evidenceRows() {
    const mode = this.state.value.evidence;
    return this.world!.observations.filter(
      (r) =>
        mode === "all" ||
        (mode === "historical"
          ? r.is_historical ||
            ["PRESERVED_SPECIMEN", "FOSSIL_SPECIMEN"].includes(
              r.basis_of_record,
            )
          : !r.is_historical &&
            [
              "HUMAN_OBSERVATION",
              "MACHINE_OBSERVATION",
              "OBSERVATION",
            ].includes(r.basis_of_record)),
    );
  }
  private activeRows() {
    const ids = new Set(this.filteredSpecies().map((s) => s.id)),
      selected = this.state.value.species;
    return this.evidenceRows().filter(
      (r) => ids.has(r.taxon_id) && (!selected || r.taxon_id === selected),
    );
  }
  private applyRecords() {
    this.renderer?.setRecords(this.activeRows(), this.state.value.species);
    this.el("clear-species").hidden = !this.state.value.species;
  }
  private renderSpecies() {
    const selected = this.state.value.species,
      rows = this.evidenceRows();
    this.el("species-list").innerHTML =
      this.filteredSpecies()
        .map((s) => {
          const count = rows.filter((r) => r.taxon_id === s.id).length;
          return `<button class="species-card ${selected === s.id ? "selected" : ""}" aria-pressed="${selected === s.id}" data-species="${escape(s.id)}"><span class="taxon-icon ${s.group.toLowerCase()}">${icons[s.group] || "·"}</span><span><strong>${escape(s.common_name)}</strong><em>${escape(s.name)}</em><small>${escape(s.group)} · ${count} records</small></span><span class="card-arrow">›</span></button>`;
        })
        .join("") || '<p class="empty">No species match these filters.</p>';
    this.el("species-list")
      .querySelectorAll<HTMLButtonElement>("[data-species]")
      .forEach(
        (b) => (b.onclick = () => this.selectSpecies(b.dataset.species!)),
      );
  }
  private detailShell(content: string) {
    const panel = this.el("detail");
    panel.hidden = false;
    panel.innerHTML = `<button class="close" id="close-detail" aria-label="Close details">×</button>${content}`;
    this.el("close-detail").onclick = () => {
      panel.hidden = true;
      this.state.set({
        phase: this.state.value.species ? "SPECIES_SELECTED" : "WORLD",
        occurrence: null,
      });
    };
  }
  private selectSpecies(id: string) {
    const s = this.world!.species.find((s) => s.id === id)!;
    this.state.set({
      phase: "SPECIES_SELECTED",
      species: id,
      occurrence: null,
    });
    this.renderSpecies();
    this.applyRecords();
    const records = this.evidenceRows().filter((r) => r.taxon_id === id);
    this.detailShell(
      `<div class="eyebrow">${escape(s.group)} / FIELD NOTES</div><h2>${escape(s.common_name)}</h2><p class="latin">${escape(s.name)}</p><div class="detail-stats"><div><strong>${records.length}</strong><span>records</span></div><div><strong>${years(s)}</strong><span>recorded evidence</span></div></div>${s.elevation_range ? `<p class="muted">Recorded elevation · ${s.elevation_range.map((x) => Math.round(x)).join("–")} m</p>` : ""}${s.media[0] ? `<figure><img src="${escape(s.media[0].thumbnail_url)}" loading="lazy" alt="Licensed source media for ${escape(s.common_name)}"><figcaption>${escape(s.media[0].attribution)}</figcaption></figure>` : ""}${
        s.conservation.length
          ? `<p class="muted small">${s.conservation
              .map((c) => {
                const v = c as { authority: string; status?: string };
                return escape(
                  `${v.authority}: ${v.status || "status unavailable"}`,
                );
              })
              .join("<br>")}</p>`
          : ""
      }<button id="fit-species" class="primary">Fit to observations ↗</button><div class="section-label">RECORDED OCCURRENCES</div><div id="record-list">${this.recordButtons(records.slice(0, 30))}</div>${records.length > 30 ? '<button id="next-records" class="text-button">Next 30 records</button>' : ""}<p class="muted small">Sources: ${escape(s.sources.join(", "))}. ${this.world!.manifest.fixture ? "All observations shown are synthetic fixtures." : ""}</p>`,
    );
    this.el("fit-species").onclick = () => void this.renderer?.fit(records);
    this.bindRecords(records);
    const next = this.host.querySelector<HTMLButtonElement>("#next-records");
    let offset = 0;
    if (next)
      next.onclick = () => {
        offset = (offset + 30) % records.length;
        this.el("record-list").innerHTML = this.recordButtons(
          records.slice(offset, offset + 30),
        );
        this.bindRecords(records);
        next.textContent = `Records ${offset + 1}–${Math.min(offset + 30, records.length)} of ${records.length} · Next`;
      };
  }
  private recordButtons(records: Observation[]) {
    return (
      records
        .map(
          (r) =>
            `<button class="record" data-record="${r.id}"><span>${date(r.event_date)}<small>${r.is_historical ? "Historical evidence" : r.is_sensitive ? "Generalized location" : "Occurrence record"}</small></span><span>${r.is_sensitive ? "◇" : "↗"}</span></button>`,
        )
        .join("") || '<p class="empty">No records in this evidence view.</p>'
    );
  }
  private bindRecords(records: Observation[]) {
    this.el("detail")
      .querySelectorAll<HTMLButtonElement>("[data-record]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            void this.selectOccurrence(
              records.find((r) => r.id === b.dataset.record)!,
            )),
      );
  }
  private async selectOccurrence(row: Observation) {
    this.state.set({ phase: "OCCURRENCE_SELECTED", occurrence: row.id });
    const id = row.id;
    this.detailShell("<p>Loading occurrence…</p>");
    try {
      const r = await loadDetail(this.world!.base, id);
      if (this.state.value.occurrence !== id) return;
      const s = this.world!.species.find((s) => s.id === r.taxon_id)!;
      this.detailShell(
        `<div class="eyebrow">OCCURRENCE / ${r.is_historical ? "HISTORICAL EVIDENCE" : "RECORDED EVIDENCE"}</div><h2>${escape(s.common_name)}</h2><p class="latin">${escape(s.name)}</p>${r.is_sensitive ? `<p class="privacy-note">◇ Protected location<br><span>Generalized to a ${r.generalization_m / 1000} km grid. This marker is not the exact observation location.</span></p>` : ""}<dl><dt>Recorded</dt><dd>${date(r.event_date)}</dd><dt>Record type</dt><dd>${escape(r.basis_of_record.replaceAll("_", " ").toLowerCase())}</dd><dt>Uncertainty</dt><dd>${Math.round(r.uncertainty_m).toLocaleString()} m</dd><dt>Source</dt><dd>${escape(r.source)}</dd><dt>Dataset</dt><dd>${escape(r.source_dataset)}</dd><dt>License</dt><dd>${escape(r.license)}</dd>${r.elevation !== undefined && !r.is_sensitive ? `<dt>Terrain elevation</dt><dd>${Math.round(r.elevation)} m</dd>` : ""}</dl><button id="fly-record" class="primary">Fly to record ↗</button>${r.source_url ? `<a class="source-link" href="${escape(r.source_url)}" target="_blank" rel="noopener noreferrer">Open source record ↗</a>` : ""}<p class="muted small">${r.is_sensitive ? "The view and all location queries use only the public, generalized position." : ""} ${this.world!.manifest.fixture ? "Synthetic fixture record; not a real wildlife observation." : ""}</p>`,
      );
      this.el("fly-record").onclick = async () => {
        const b = this.el<HTMLButtonElement>("fly-record");
        b.disabled = true;
        b.textContent = "Flying…";
        await this.renderer?.flyTo(row);
        b.disabled = false;
        b.textContent = "Fly to record ↗";
      };
    } catch (e) {
      this.status(String(e));
    }
  }
  private queryLocation(lon: number, lat: number, radius = 2) {
    this.point = [lon, lat];
    this.state.set({ phase: "LOCATION_QUERY", occurrence: null });
    const records = this.spatial!.nearby(lon, lat, radius);
    const grouped = new Map<string, Observation[]>();
    for (const r of records) {
      const list = grouped.get(r.taxon_id) || [];
      list.push(r);
      grouped.set(r.taxon_id, list);
    }
    const dates = records
      .map((r) => r.event_date)
      .filter((d): d is string => !!d)
      .sort();
    this.detailShell(
      `<div class="eyebrow">EXPLORE THIS PLACE</div><h2>What’s been<br>found here?</h2><label class="radius-label">Within <select id="radius" aria-label="Location query radius"><option value="1">1 km</option><option value="2">2 km</option><option value="5">5 km</option></select></label><div class="detail-stats"><div><strong>${grouped.size}</strong><span>species</span></div><div><strong>${records.length}</strong><span>records</span></div></div><p class="muted small">${dates.length ? `${dates[0].slice(0, 4)}–${dates.at(-1)!.slice(0, 4)} · ` : ""}All public evidence near this point.</p><div id="nearby-species">${
        [...grouped]
          .sort((a, b) => b[1].length - a[1].length)
          .map(
            ([id, rows]) =>
              `<button class="nearby-row" data-nearby="${id}"><span>${escape(this.world!.species.find((s) => s.id === id)?.common_name)}</span><strong>${rows.length}</strong></button>`,
          )
          .join("") ||
        '<p class="empty">No recorded evidence in this radius. This does not mean no organisms live here.</p>'
      }</div><p class="muted small">Sensitive records use generalized positions and may be counted in a neighboring area.</p>`,
    );
    this.el<HTMLSelectElement>("radius").value = String(radius);
    this.el("radius").onchange = (e) => {
      const [x, y] = this.point!;
      this.queryLocation(x, y, Number((e.target as HTMLSelectElement).value));
    };
    this.el("nearby-species")
      .querySelectorAll<HTMLButtonElement>("[data-nearby]")
      .forEach(
        (b) => (b.onclick = () => this.selectSpecies(b.dataset.nearby!)),
      );
  }
  private async setMode(mode: Mode) {
    const buttons = [
      ...this.host.querySelectorAll<HTMLButtonElement>("[data-mode]"),
    ];
    buttons.forEach((b) => (b.disabled = true));
    this.state.set({ mode });
    this.host
      .querySelectorAll<HTMLButtonElement>("[data-mode]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === mode)),
      );
    const captions: Record<Mode, string> = {
      WORLD: "Terrain · imagery · ecological context",
      AERIAL: "Orthographic surface imagery",
      VEGETATION: "Vegetation cover · data-informed context",
      ELEVATION: `Elevation · ${Math.round(this.world!.manifest.terrain.elevation_min)}–${Math.round(this.world!.manifest.terrain.elevation_max)} m`,
      SPECIES: "Recorded biodiversity · public locations",
    };
    this.el("mode-caption").textContent = captions[mode];
    try {
      await this.renderer?.setMode(mode);
    } catch (e) {
      this.status(String(e));
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  private async showSources() {
    const dialog = this.el<HTMLDialogElement>("sources-dialog");
    this.el("source-content").innerHTML =
      '<h2 id="sources-title">Data & sources</h2><p>Loading provenance…</p>';
    dialog.showModal();
    if (!this.world) {
      this.el("source-content").innerHTML =
        '<h2 id="sources-title">Data & sources</h2><p>Wildscape builds geographic assets before they reach your browser. Enter a world to inspect its sources and build provenance.</p><p>Earth land boundaries: <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth · public domain</a>.</p><p>World 001 uses real geographic data and recorded biodiversity. The separate fixture world is explicitly synthetic.</p>';
      return;
    }
    try {
      const a = await json<{
        sources: { name: string; license: string; url: string }[];
        vegetation: string;
        evidence: string;
        privacy: string;
        datasets: string[];
      }>(this.world.base + "attribution.json");
      this.el("source-content").innerHTML =
        `<div class="eyebrow">TRANSPARENT BY DESIGN</div><h2 id="sources-title">Data & sources</h2>${this.world.manifest.fixture ? '<p class="privacy-note">Fixture demonstration. Terrain, imagery, vegetation inputs and occurrences are synthetic. The geographic footprint is not a verified BpS 10820 site.</p>' : ""}${a.sources.map((s) => `<div class="source-item"><strong>${escape(s.name)}</strong><p>${escape(s.license)}</p>${s.url ? `<a href="${escape(s.url)}" target="_blank" rel="noopener">Source documentation ↗</a>` : ""}</div>`).join("")}<p>${escape(a.vegetation)}</p><p>${escape(a.evidence)}</p><p>${escape(a.privacy)}</p><dl><dt>Build</dt><dd>${escape(this.world.manifest.build_version)}</dd><dt>Built at</dt><dd>${escape(this.world.manifest.built_at)}</dd><dt>Renderer</dt><dd>${escape(this.renderer?.name)}</dd><dt>Projected CRS</dt><dd>${escape(this.world.manifest.terrain.crs)}</dd></dl><a href="${this.world.base}manifest.json" target="_blank" rel="noopener">Open build manifest ↗</a>`;
    } catch (e) {
      this.el("source-content").textContent = String(e);
    }
  }
}
