import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../screening/screening.css";
import "./planner.css";
import { WorkspaceStore } from "../screening/workspace";
import { attributes } from "../screening/attributes";
import { esc, link, download, fmt } from "../screening/utils";

type Source = {
  status: string;
  title: string;
  source?: string;
  interpretation: string;
  retrievedAt: string;
  label?: string;
  code?: string | null;
  release?: string;
  resolutionM?: number;
  valueM?: number;
  acquisitionDate?: string;
  intersects?: boolean;
  units?: Record<string, unknown>[];
  count?: number;
  bounds?: number[];
  halfWidthM?: number;
};
interface Profile {
  schema: number;
  longitude: number;
  latitude: number;
  region: string;
  focalSpecies: string;
  generatedAt: string;
  sources: Record<string, Source>;
  protocolSource: string;
  fieldChecks: string[];
  suitability: string;
  evidenceToken?: string;
  cached?: boolean;
}
interface RecordArea {
  bounds: number[];
  center: number[];
  status: "ok" | "unavailable";
  count: number | null;
}
interface AreaScan {
  schema: number;
  region: string;
  focalSpecies: string;
  center: number[];
  cellSizeKm: number;
  sinceYear: number;
  status: "complete" | "partial";
  areas: RecordArea[];
  retrievedAt: string;
  source: string;
  method: string;
  interpretation: string;
  cached?: boolean;
}
interface Site {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  profile: Profile;
  notes: string;
  status: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export class MojavePlanner {
  private store = new WorkspaceStore();
  private map!: L.Map;
  private marker?: L.CircleMarker;
  private envelope?: L.Rectangle;
  private areaLayer = L.layerGroup();
  private areaScan?: AreaScan;
  private profile?: Profile;
  private sites: Site[] = [];
  private selectedSite?: Site;
  private sequence = 0;
  private dirty = false;
  private saving = false;
  private halfWidth = 5000;
  constructor(private root: HTMLElement) {
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty || this.saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }
  private canChangePoint(): boolean {
    if (this.saving) {
      this.status("Saving this assessment. Wait before changing locations.");
      return false;
    }
    if (
      this.dirty &&
      !window.confirm(
        "Discard the unsaved site assessment and change locations? Cancel to keep editing or export it privately.",
      )
    )
      return false;
    this.dirty = false;
    return true;
  }
  private async api<T>(path: string, body?: unknown): Promise<T> {
    const result = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(35000),
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": this.store.session?.csrfToken || "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await result
      .json()
      .catch(() => ({ error: "Survey data service is unavailable." }));
    if (!result.ok)
      throw Error(data.error || "Survey data service is unavailable.");
    return data as T;
  }
  async start() {
    try {
      await this.store.open(this.root);
      if (!this.store.session)
        throw Error(
          "Start the WildScape API to use live Mojave point screening.",
        );
      this.root.innerHTML = `<div class="planner"><header class="workspace-header"><div><strong>WILDSCAPE</strong><span>Mojave desert tortoise survey planning</span></div><span>${esc(this.store.label)}</span><a href="/">Project workspace</a></header><main class="planner-layout"><section class="planner-map-column"><div class="planner-toolbar"><button id="mojave-home">Whole Mojave</button><button id="inspect-center">Inspect map center</button><label>Basemap<select id="planner-basemap" aria-label="Basemap"><option value="imagery">USGS aerial imagery</option><option value="topo">USGS topographic map</option></select></label></div><div id="mojave-map" aria-label="Mojave survey planning map"></div><p class="planner-map-note">Outline: EPA Mojave Basin and Range · selected point: gold · record search box: dashed gold. Imagery is historical; detail and dates vary by source.</p></section><aside class="planner-panel"><p class="eyebrow">GOPHERUS AGASSIZII / SURVEY PLANNING</p><h1>Inspect any Mojave location</h1><p>Click the map or enter coordinates to gather public evidence for a potential survey site.</p><section class="record-search" aria-label="Find public record concentrations"><h2>Find recorded areas</h2><p>Rank broad areas around the map center by public tortoise record count.</p><div class="record-controls"><label>Area size<select id="area-size"><option value="25">25 × 25 km</option><option value="50">50 × 50 km</option></select></label><label>Record year<select id="area-year"><option value="0">All years</option><option value="2015">2015 onward</option><option value="2020">2020 onward</option></select></label><button id="find-record-areas" type="button">Find recorded areas</button></div><p id="areas-status" role="status">Search up to 16 areas around the map center.</p><div id="area-results"></div></section><form id="point-form"><div class="coordinate-inputs"><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" value="-116" required></label><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" value="35" required></label></div><label>Public-record search box<select name="halfWidth" aria-label="Public-record search box"><option value="1000">2 × 2 km (approximate)</option><option value="5000" selected>10 × 10 km (approximate)</option><option value="10000">20 × 20 km (approximate)</option></select></label><button class="primary">Inspect point</button></form><p id="planner-status" role="status">Choose a location. No occupancy or habitat-suitability model is applied.</p><div id="point-profile"></div><section id="saved-sites"></section><p class="earth-caveat">Point coordinates are sent to USGS, USFWS and GBIF services for lookup. This view summarizes public sources; use project field tools for private observations.</p></aside></main></div>`;
      this.map = L.map(this.root.querySelector<HTMLElement>("#mojave-map")!, {
        center: [35.6, -116],
        zoom: 7,
        minZoom: 5,
        maxZoom: 18,
      });
      const imagery = L.tileLayer(
        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 16,
          maxZoom: 18,
          attribution:
            'Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>',
        },
      );
      const topo = L.tileLayer(
        "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
        {
          maxNativeZoom: 16,
          maxZoom: 18,
          attribution:
            'Basemap: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS</a>',
        },
      );
      imagery.addTo(this.map);
      this.areaLayer.addTo(this.map);
      L.control.scale({ imperial: false }).addTo(this.map);
      const region = await fetch("/screening/mojave/region.geojson").then(
        (r) => {
          if (!r.ok) throw Error("Mojave boundary unavailable");
          return r.json();
        },
      );
      const boundary = L.geoJSON(region, {
        style: { color: "#d3c17b", weight: 2, fillOpacity: 0.035 },
        interactive: false,
      }).addTo(this.map);
      this.map.fitBounds(boundary.getBounds(), { padding: [20, 20] });
      this.map.on(
        "click",
        (e: L.LeafletMouseEvent) =>
          void this.inspect(e.latlng.lng, e.latlng.lat),
      );
      this.root
        .querySelector("#mojave-home")!
        .addEventListener("click", () =>
          this.map.fitBounds(boundary.getBounds()),
        );
      this.root
        .querySelector("#inspect-center")!
        .addEventListener("click", () => {
          const p = this.map.getCenter();
          void this.inspect(p.lng, p.lat);
        });
      this.root
        .querySelector("#planner-basemap")!
        .addEventListener("change", (e) => {
          this.map.removeLayer(imagery);
          this.map.removeLayer(topo);
          ((e.target as HTMLSelectElement).value === "imagery"
            ? imagery
            : topo
          ).addTo(this.map);
        });
      this.root.querySelector<HTMLFormElement>("#point-form")!.onsubmit = (
        e,
      ) => {
        e.preventDefault();
        const d = new FormData(e.target as HTMLFormElement);
        this.halfWidth = Number(d.get("halfWidth"));
        void this.inspect(
          Number(d.get("longitude")),
          Number(d.get("latitude")),
          true,
        );
      };
      this.root
        .querySelector("#find-record-areas")!
        .addEventListener("click", () => void this.findAreas());
      imagery.on("tileerror", () => {
        this.root.querySelector(".planner-map-note")!.textContent =
          "Some imagery tiles could not load. Switch to the topographic basemap or retry later; point data can still be inspected.";
      });
      await this.loadSites();
    } catch (error) {
      this.root.innerHTML = `<main class="account-screen"><h1>Survey planner could not load</h1><p>${esc(error instanceof Error ? error.message : error)}</p><a href="/?planner=mojave">Retry planner</a> · <a href="/">Project workspace</a></main>`;
    }
  }
  private async findAreas() {
    const button =
      this.root.querySelector<HTMLButtonElement>("#find-record-areas")!;
    if (button.disabled) return;
    button.disabled = true;
    const status = this.root.querySelector<HTMLElement>("#areas-status")!;
    status.textContent =
      "Counting public records in broad areas around the map center…";
    const center = this.map.getCenter();
    try {
      const scan = await this.api<AreaScan>("mojave/record-areas/", {
        longitude: center.lng,
        latitude: center.lat,
        cellSizeKm: Number(
          (this.root.querySelector("#area-size") as HTMLSelectElement).value,
        ),
        sinceYear: Number(
          (this.root.querySelector("#area-year") as HTMLSelectElement).value,
        ),
      });
      this.areaScan = scan;
      this.areaLayer.clearLayers();
      const valid = scan.areas.filter((a) => a.status === "ok");
      const failed = scan.areas.length - valid.length;
      const max = Math.max(1, ...valid.map((a) => a.count || 0));
      scan.areas.forEach((area, index) => {
        const b = area.bounds;
        const color =
          area.status === "unavailable"
            ? "#7c7f78"
            : area.count === 0
              ? "#6b8473"
              : area.count === max
                ? "#b14a24"
                : "#bc7943";
        const fillOpacity =
          area.status === "unavailable"
            ? 0.08
            : area.count === 0
              ? 0.08
              : 0.14 + (0.4 * (area.count || 0)) / max;
        const rectangle = L.rectangle(
          [
            [b[1], b[0]],
            [b[3], b[2]],
          ],
          {
            color,
            weight: 2,
            fillColor: color,
            fillOpacity,
            bubblingMouseEvents: false,
          },
        );
        rectangle.bindTooltip(
          area.status === "ok"
            ? `${area.count} public records · broad area`
            : "Record count unavailable",
        );
        rectangle.on("click", () => this.focusArea(index));
        rectangle.addTo(this.areaLayer);
      });
      status.textContent = `${valid.length} areas counted${failed ? `; ${failed} unavailable` : ""} · ${scan.cellSizeKm} km cells · ${scan.sinceYear ? scan.sinceYear + " onward" : "all years"} · ${scan.cached ? "cached" : "retrieved"} ${scan.retrievedAt}`;
      this.renderAreas();
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
    }
  }
  private focusArea(index: number) {
    const area = this.areaScan?.areas[index];
    if (!area) return;
    const b = area.bounds;
    this.map.fitBounds(
      [
        [b[1], b[0]],
        [b[3], b[2]],
      ],
      { padding: [45, 45], maxZoom: 11 },
    );
    const status = this.root.querySelector<HTMLElement>("#areas-status")!;
    status.textContent =
      area.status === "ok"
        ? `Area ${index + 1}: ${area.count} public records. The area center is not an animal location.`
        : `Area ${index + 1}: count unavailable. Retry the search later.`;
  }
  private renderAreas() {
    const scan = this.areaScan!;
    const host = this.root.querySelector<HTMLElement>("#area-results")!;
    host.innerHTML = `${scan.areas.length ? scan.areas.map((area, index) => `<div class="record-area"><button data-area="${index}" type="button"><strong>${area.status === "ok" ? `${index + 1}. ${area.count} public records` : `${index + 1}. Count unavailable`}</strong><small>Approx. ${scan.cellSizeKm} × ${scan.cellSizeKm} km area</small></button>${area.status === "ok" ? `<button data-inspect-area="${index}" type="button">Inspect area center</button>` : ""}</div>`).join("") : "<p>No cell centers fall inside the pilot region from this map center.</p>"}<p class="earth-caveat">${esc(scan.interpretation)}</p>${link(scan.source, "GBIF species records")}<button id="export-areas" type="button">Export ranked areas (GeoJSON)</button>`;
    host.querySelector("#export-areas")?.addEventListener("click", () => {
      download(
        "mojave-public-record-areas.geojson",
        JSON.stringify(
          {
            type: "FeatureCollection",
            metadata: {
              source: scan.source,
              method: scan.method,
              interpretation: scan.interpretation,
              retrievedAt: scan.retrievedAt,
              cellSizeKm: scan.cellSizeKm,
              sinceYear: scan.sinceYear,
              region: scan.region,
            },
            features: scan.areas.map((area, index) => {
              const [w, s, e, n] = area.bounds;
              return {
                type: "Feature",
                geometry: {
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
                },
                properties: {
                  rank: index + 1,
                  count: area.count,
                  status: area.status,
                  cellSizeKm: scan.cellSizeKm,
                  sinceYear: scan.sinceYear,
                },
              };
            }),
          },
          null,
          2,
        ),
        "application/geo+json",
      );
    });
    host
      .querySelectorAll<HTMLButtonElement>("[data-area]")
      .forEach(
        (button) =>
          (button.onclick = () => this.focusArea(Number(button.dataset.area))),
      );
    host.querySelectorAll<HTMLButtonElement>("[data-inspect-area]").forEach(
      (button) =>
        (button.onclick = () => {
          const area = scan.areas[Number(button.dataset.inspectArea)];
          void this.inspect(area.center[0], area.center[1], true);
        }),
    );
  }
  private status(message: string) {
    this.root.querySelector("#planner-status")!.textContent = message;
  }
  private async inspect(lon: number, lat: number, fly = false) {
    if (!this.canChangePoint()) return;
    this.halfWidth = Number(
      (this.root.querySelector('[name="halfWidth"]') as HTMLSelectElement)
        .value,
    );
    const sequence = ++this.sequence;
    this.profile = undefined;
    this.selectedSite = undefined;
    this.root.querySelector("#point-profile")!.innerHTML = "";
    this.status(
      "Retrieving elevation, vegetation, critical-habitat context and public record counts…",
    );
    this.marker?.remove();
    this.envelope?.remove();
    this.marker = L.circleMarker([lat, lon], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: "#edc869",
      fillOpacity: 1,
    }).addTo(this.map);
    if (fly) this.map.setView([lat, lon], Math.max(this.map.getZoom(), 11));
    (this.root.querySelector('[name="longitude"]') as HTMLInputElement).value =
      lon.toFixed(6);
    (this.root.querySelector('[name="latitude"]') as HTMLInputElement).value =
      lat.toFixed(6);
    try {
      const p = await this.api<Profile>("mojave/point/", {
        longitude: lon,
        latitude: lat,
        halfWidthM: this.halfWidth,
      });
      if (sequence !== this.sequence) return;
      this.profile = p;
      const b = p.sources.occurrences?.bounds;
      if (b)
        this.envelope = L.rectangle(
          [
            [b[1], b[0]],
            [b[3], b[2]],
          ],
          { color: "#edc869", weight: 1.5, dashArray: "5 5", fillOpacity: 0 },
        ).addTo(this.map);
      const missing = Object.values(p.sources).filter(
        (s) => s.status === "unavailable",
      ).length;
      this.status(
        missing
          ? `${missing} source(s) unavailable. Missing evidence is marked below.`
          : `Point profile ready · ${p.cached ? "cached source responses" : "sources retrieved"}`,
      );
      this.renderProfile();
    } catch (error) {
      if (sequence === this.sequence)
        this.status(String(error instanceof Error ? error.message : error));
    }
  }
  private renderProfile() {
    const p = this.profile!;
    const sourceCard = (id: string, s: Source) => {
      const rows = [
        {
          label: "Source status",
          value:
            s.status === "ok"
              ? "Retrieved"
              : s.status === "nodata"
                ? "No mapped value"
                : "Unavailable",
        },
      ];
      if (s.status !== "unavailable") {
        if (s.label) rows.push({ label: "Mapped class", value: s.label });
        if (s.code) rows.push({ label: "Class code", value: s.code });
        if (s.release)
          rows.push({ label: "Product release", value: s.release });
        if (s.valueM !== undefined)
          rows.push({ label: "Elevation", value: `${fmt(s.valueM)} m` });
        if (s.resolutionM)
          rows.push({
            label: "Source resolution",
            value: `${s.resolutionM} m`,
          });
        if (s.acquisitionDate)
          rows.push({ label: "Acquisition date", value: s.acquisitionDate });
        if (s.intersects !== undefined)
          rows.push({
            label: "Point intersects mapped unit",
            value: s.intersects ? "Yes" : "No mapped intersection",
          });
        if (s.units?.length)
          rows.push({
            label: "Mapped units",
            value: s.units
              .map((u) => String(u.unitname || u.unit || "Unnamed unit"))
              .join(", "),
          });
        if (s.count !== undefined)
          rows.push({ label: "Public record count", value: String(s.count) });
        if (s.halfWidthM)
          rows.push({
            label: "Search box dimensions",
            value: `Approximately ${(s.halfWidthM * 2) / 1000} × ${(s.halfWidthM * 2) / 1000} km`,
          });
      }
      rows.push({ label: "Retrieved (UTC)", value: s.retrievedAt });
      return `<article class="planner-source ${s.status === "unavailable" ? "source-unavailable" : ""}" data-source="${esc(id)}"><h3>${esc(s.title)}</h3>${attributes(rows)}${s.source ? link(s.source, "Source metadata") : ""}<p class="earth-caveat">${esc(s.interpretation)}</p></article>`;
    };
    this.root.querySelector("#point-profile")!.innerHTML =
      `<h2>Point attributes</h2>${attributes([
        { label: "Longitude", value: `${p.longitude.toFixed(6)}°` },
        { label: "Latitude", value: `${p.latitude.toFixed(6)}°` },
        { label: "Coordinate system", value: "WGS84 / EPSG:4326" },
        { label: "Focal species", value: p.focalSpecies },
        { label: "Coverage", value: p.region },
      ])}${Object.entries(p.sources)
        .map(([id, s]) => sourceCard(id, s))
        .join(
          "",
        )}<h2>Field verification</h2><ul>${p.fieldChecks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>${link(p.protocolSource, "USFWS pre-project survey reference (2019)")}<p class="earth-caveat">${esc(p.suitability)}</p><button id="export-point">Export point profile (private GeoJSON)</button>${this.store.cloud ? `<h2>${this.selectedSite ? "Saved survey site" : "Save candidate survey site"}</h2><form id="save-site"><label>Site name<input name="name" required maxlength="180" value="${esc(this.selectedSite?.name || "")}"></label><label>Team assessment<select name="status" aria-label="Team assessment">${["To review", "Survey planned", "Surveyed", "Deprioritized"].map((s) => `<option ${this.selectedSite?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Rationale / next action<textarea name="notes" rows="3">${esc(this.selectedSite?.notes || "")}</textarea></label><button ${!this.store.editable ? "disabled" : ""}>Save to consultancy workspace</button></form>${this.selectedSite ? "<p>This is a saved evidence snapshot. Inspect the coordinates again to retrieve current sources.</p><button id='site-history'>Review site history</button><div id='site-history-list' aria-live='polite'></div>" : ""}` : '<p><a href="/?planner=mojave&workspace=1">Sign in to save candidate survey sites with your team.</a></p>'}`;
    this.root
      .querySelector("#site-history")
      ?.addEventListener("click", () => void this.showHistory());
    this.root.querySelector("#save-site")?.addEventListener("input", () => {
      this.dirty = true;
      this.status(
        "Unsaved assessment. Save to your workspace or export a private draft before leaving.",
      );
    });
    this.root.querySelector("#export-point")!.addEventListener("click", () => {
      const { evidenceToken, ...profile } = p;
      const form = this.root.querySelector<HTMLFormElement>("#save-site");
      const draft = form ? new FormData(form) : undefined;
      void evidenceToken;
      download(
        "mojave-point-PRIVATE.geojson",
        JSON.stringify(
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
            properties: {
              name: String(
                draft?.get("name") ||
                  this.selectedSite?.name ||
                  "Mojave survey candidate",
              ),
              assessment: draft
                ? {
                    siteId: this.selectedSite?.id || null,
                    status: draft.get("status"),
                    rationale: draft.get("notes"),
                    saveState: this.dirty
                      ? "Unsaved draft"
                      : this.selectedSite
                        ? "Saved"
                        : "Not saved",
                    lastSavedVersion: this.selectedSite?.version || null,
                    lastSavedAt: this.selectedSite?.updatedAt || null,
                    lastSavedBy: this.selectedSite?.updatedBy || null,
                  }
                : null,
              ...profile,
            },
          },
          null,
          2,
        ),
        "application/geo+json",
      );
    });
    this.root
      .querySelector<HTMLFormElement>("#save-site")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        void this.saveSite(new FormData(e.target as HTMLFormElement));
      });
  }
  private async showHistory() {
    const site = this.selectedSite;
    if (!site || !this.store.workspace) return;
    const host = this.root.querySelector<HTMLElement>("#site-history-list")!;
    host.textContent = "Loading saved assessments…";
    try {
      const result = await this.api<{
        revisions: {
          version: number;
          name: string;
          notes: string;
          status: string;
          actor: string;
          recordedAt: string;
        }[];
      }>(`workspaces/${this.store.workspace.id}/sites/${site.id}/revisions/`);
      host.innerHTML =
        result.revisions
          .map(
            (r) =>
              `<article><h3>Version ${r.version}</h3>${attributes([
                { label: "Site name", value: r.name },
                { label: "Team assessment", value: r.status },
                { label: "Rationale", value: r.notes || "Not provided" },
                { label: "Reviewer", value: r.actor },
                { label: "Recorded (UTC)", value: r.recordedAt },
              ])}</article>`,
          )
          .join("") || "No earlier assessments recorded.";
    } catch (error) {
      host.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  private async saveSite(data: FormData) {
    if (
      !this.store.workspace ||
      !this.profile ||
      this.saving ||
      !this.store.editable
    )
      return;
    this.saving = true;
    (this.root.querySelector("#export-point") as HTMLButtonElement).disabled =
      true;
    const form = this.root.querySelector<HTMLFormElement>("#save-site")!;
    form
      .querySelectorAll<
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
        | HTMLButtonElement
      >("input,select,textarea,button")
      .forEach((el) => (el.disabled = true));
    this.status("Saving assessment…");
    try {
      const saved = await this.api<Site>(
        `workspaces/${this.store.workspace.id}/sites/${this.selectedSite ? this.selectedSite.id + "/" : ""}`,
        {
          version: this.selectedSite?.version,
          name: data.get("name"),
          status: data.get("status"),
          notes: data.get("notes"),
          evidenceToken: this.profile.evidenceToken,
        },
      );
      this.selectedSite = saved;
      this.dirty = false;
      this.status("Survey site saved to your consultancy workspace.");
      this.renderProfile();
      try {
        await this.loadSites();
      } catch {
        this.status(
          "Assessment saved, but the site list could not refresh. Reload to see the latest list.",
        );
      }
    } catch (error) {
      this.status(
        `Assessment not confirmed saved: ${error instanceof Error ? error.message : error}. Your edits remain here; export a private draft before reloading.`,
      );
    } finally {
      this.saving = false;
      (this.root.querySelector("#export-point") as HTMLButtonElement).disabled =
        false;
      form
        .querySelectorAll<
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | HTMLButtonElement
        >("input,select,textarea,button")
        .forEach((el) => (el.disabled = false));
    }
  }
  private async loadSites() {
    const host = this.root.querySelector("#saved-sites")!;
    if (!this.store.workspace) return;
    const result = await this.api<{ sites: Site[] }>(
      `workspaces/${this.store.workspace.id}/sites/`,
    );
    this.sites = result.sites;
    host.innerHTML = `<h2>Team survey sites</h2>${this.sites.map((s) => `<button class="saved-site" data-site="${esc(s.id)}"><strong>${esc(s.name)}</strong><span>Status: ${esc(s.status)}</span><small>${s.longitude.toFixed(4)}°, ${s.latitude.toFixed(4)}°</small></button>`).join("") || "<p>No sites saved yet.</p>"}`;
    host.querySelectorAll<HTMLButtonElement>("[data-site]").forEach(
      (button) =>
        (button.onclick = () => {
          if (!this.canChangePoint()) return;
          const site = this.sites.find((s) => s.id === button.dataset.site)!;
          ++this.sequence;
          this.selectedSite = site;
          this.profile = site.profile;
          this.envelope?.remove();
          (
            this.root.querySelector('[name="longitude"]') as HTMLInputElement
          ).value = String(site.longitude);
          (
            this.root.querySelector('[name="latitude"]') as HTMLInputElement
          ).value = String(site.latitude);
          const b = site.profile.sources.occurrences?.bounds;
          if (b)
            this.envelope = L.rectangle(
              [
                [b[1], b[0]],
                [b[3], b[2]],
              ],
              {
                color: "#edc869",
                weight: 1.5,
                dashArray: "5 5",
                fillOpacity: 0,
              },
            ).addTo(this.map);
          this.map.setView([site.latitude, site.longitude], 12);
          this.marker?.remove();
          this.marker = L.circleMarker([site.latitude, site.longitude], {
            radius: 7,
            color: "#edc869",
          }).addTo(this.map);
          this.status(`Saved snapshot · ${site.updatedAt}`);
          this.renderProfile();
        }),
    );
  }
}
