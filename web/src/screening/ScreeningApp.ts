import "./screening.css";
import { WorkspaceStore } from "./workspace";
import { parseFieldCSV, fieldCSVTemplate } from "./fieldCSV";
import type { Pack, Project, ScreeningRow, Decision } from "./types";
import {
  newProject,
  touch,
  screen,
  issues,
  validateReview,
  parseField,
  restoreProject,
} from "./model";
import {
  parsePolygon,
  bboxPolygon,
  areaHa,
  summarizeHabitat,
  coverage,
} from "./geo";
import { MapView } from "./MapView";
import { esc, fmt, link, download, readJSON } from "./utils";
import { attributes } from "./attributes";
import { speciesCSV, evidenceCSV, projectGeoJSON, report } from "./exports";
import { nearbyRecords, regionalSpecies, sampleHabitat } from "./explore";
import type { XY } from "./types";
import { regionalCandidates } from "./candidates";
import {
  groupIcons,
  orderLabel,
  taxonOrder,
  taxonFamily,
  verifiedPhoto,
} from "./browse";
import type { MediaCatalogue } from "./browse";
const tabs = [
  "Explore",
  "Site",
  "Species",
  "Habitat",
  "Field",
  "Review",
  "Deliver",
];
const decisions: Decision[] = [
  "Unreviewed",
  "Further assessment",
  "Survey recommended",
  "Retain for screening",
  "Screened out",
];
export class ScreeningApp {
  private store = new WorkspaceStore();
  private pack!: Pack;
  private media?: MediaCatalogue;
  private exploreGroup = "All";
  private exploreOrder = "All";
  private reviewGroup = "All";
  private projects: Project[] = [];
  private p!: Project;
  private map!: MapView;
  private tab = "Explore";
  private explorePoint: XY = [-114.5933, 37.2159];
  private exploreRadius = 2000;
  private exploreScope: "point" | "region" = "point";
  private exploreSpecies = "";
  private exploreQuery = "";
  private selected = "";
  private query = "";
  private message = "";
  constructor(private root: HTMLElement) {}
  async start() {
    this.root.innerHTML =
      '<p class="loading">Loading Wildscape scientific workspace…</p>';
    try {
      await this.store.open(this.root);
      this.store.onState = (message) => {
        this.message = message;
        const el = this.root.querySelector("#save-state");
        if (el) {
          el.textContent = message;
          el.setAttribute("role", "status");
        }
      };
      const res = await fetch("/screening/mojave-001/pack.json");
      if (!res.ok) throw Error("Screening pack unavailable.");
      this.pack = await res.json();
      await Promise.all(
        this.pack.layers.map(async (l) => {
          const r = await fetch(`/screening/mojave-001/${l.data}`);
          if (!r.ok) throw Error("Habitat raster unavailable");
          const b = await r.arrayBuffer();
          if (b.byteLength !== l.size * l.size * 2)
            throw Error("Invalid habitat raster length");
          const v = new DataView(b);
          l.values = Int16Array.from({ length: l.size * l.size }, (_, i) =>
            v.getInt16(i * 2, true),
          );
        }),
      );
      const mediaResponse = await fetch(
        "/screening/mojave-001/media.json",
      ).catch(() => null);
      if (mediaResponse?.ok) {
        const catalogue = (await mediaResponse.json()) as MediaCatalogue;
        if (catalogue.schema === 1 && catalogue.world === "mojave-001")
          this.media = catalogue;
      }
      this.projects = await this.store.load();
      this.p = this.projects[0] || newProject();
      if (!this.projects.length && this.store.editable) {
        this.projects.push(this.p);
        if (this.store.cloud) this.persistProjects();
      }
      this.layout();
    } catch (e) {
      this.root.innerHTML = `<main class="loading"><h1>Workspace could not load</h1><p>${esc(e)}</p><p>Existing browser data has not been overwritten. Check the local server and project backup.</p></main>`;
    }
  }
  private rows() {
    return screen(this.p, this.pack);
  }
  private save(action: string, evidence = false) {
    if (evidence) {
      for (const r of Object.values(this.p.reviews)) r.decision = "Unreviewed";
      this.p.habitatChecked = false;
      this.p.agencyChecked = false;
    }
    touch(this.p, action);
    this.persistProjects();
  }
  private persistProjects() {
    this.store.save(this.projects);
  }
  private input(
    name: string,
    label: string,
    value: unknown = "",
    type = "text",
  ) {
    return `<label>${label}<input name="${name}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(value)}"></label>`;
  }
  private text(name: string, label: string, value = "") {
    return `<label>${label}<textarea name="${name}" rows="3">${esc(value)}</textarea></label>`;
  }
  private check(name: string, label: string, v: boolean) {
    return `<label class="check"><input type="checkbox" name="${name}" ${v ? "checked" : ""}>${label}</label>`;
  }
  private layout() {
    this.root.innerHTML = `<div class="screening"><header class="workspace-header"><div><strong>WILDSCAPE</strong><span>${esc(this.store.label)}</span></div><select aria-label="Project" id="project-select">${this.projects.map((p) => `<option value="${esc(p.id)}" ${p === this.p ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><a class="planner-link" href="/?planner=mojave">Mojave tortoise planner ↗</a><button data-action="team">${this.store.cloud ? "Team workspace" : "Sign in to workspace"}</button><button data-action="new">New project</button><button data-action="example">Worked example</button><label class="file-button">Restore backup<input type="file" id="backup" accept=".json"></label>${import.meta.env.VITE_REQUIRE_ACCOUNT === "true" ? "" : '<a href="/?explore=1" target="_blank" rel="noopener">3D context ↗</a>'}</header><nav>${tabs.map((t) => `<button data-tab="${t}" class="${t === this.tab ? "active" : ""}">${t}</button>`).join("")}<span id="save-state">${esc(this.message || this.store.label)}</span></nav><div class="workspace-body"><section class="map-column"><div class="map-toolbar"><select id="layer" aria-label="Map layer"><option value="imagery">NAIP orthophotography</option>${this.pack.layers.map((l) => `<option value="${l.id}">${esc(l.title)}</option>`).join("")}</select><button data-action="draw">Draw boundary</button><button data-action="finish">Finish</button><button data-action="undo">Undo vertex</button><button data-action="cancel">Cancel</button><button data-action="fit">Fit site</button><button data-action="home">Region</button><button data-action="in" aria-label="Zoom in">+</button><button data-action="out" aria-label="Zoom out">−</button><label><input id="records" type="checkbox" checked>Records</label></div><div id="plan-map"></div><div id="map-key"></div><div class="map-caption">Yellow: project footprint · mint: public occurrence · violet: generalized location / sensitive field evidence · orange: field evidence. Click map to read coordinates. Imagery detail improves with zoom; source resolution remains finite.</div><div id="coordinates">WGS84 longitude, latitude · analysis EPSG:32611</div></section><aside id="panel"></aside></div><footer>Evidence supports professional judgement. Missing records do not demonstrate absence. Regional candidates are provisional and incomplete.</footer></div>`;
    this.map = new MapView(
      this.root.querySelector("#plan-map")!,
      this.pack,
      (p) => {
        this.boundary(p);
      },
      (xy) => {
        this.explorePoint = xy;
        this.exploreSpecies = "";
        this.exploreQuery = "";
        this.exploreGroup = "All";
        this.exploreOrder = "All";
        this.exploreScope = "point";
        this.tab = "Explore";
        this.map.select(undefined);
        this.map.setFocus(xy, this.exploreRadius);
        this.root.querySelector("#coordinates")!.textContent =
          `Selected longitude ${xy[0].toFixed(6)} · latitude ${xy[1].toFixed(6)}`;
        this.panel();
      },
    );
    this.map.update(this.p);
    this.map.setFocus(this.explorePoint, this.exploreRadius);
    this.root
      .querySelector("#project-select")!
      .addEventListener("change", (e) => {
        this.p = this.projects.find(
          (p) => p.id === (e.target as HTMLSelectElement).value,
        )!;
        this.selected = "";
        this.layout();
      });
    this.root.querySelector("#layer")!.addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      this.map.setLayer(id);
      this.renderMapKey(id);
    });
    this.root
      .querySelector("#records")!
      .addEventListener("change", (e) =>
        this.map.setRecords((e.target as HTMLInputElement).checked),
      );
    this.root.querySelector("#backup")!.addEventListener(
      "change",
      (e) =>
        void this.guard(async () => {
          if (!this.store.editable)
            throw Error("Your workspace role is read-only.");
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          const p = restoreProject(await readJSON(f));
          p.id = crypto.randomUUID();
          this.projects.push(p);
          this.p = p;
          this.save("Restored project backup");
          this.layout();
        }),
    );
    this.root.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-action],[data-tab],[data-species],[data-explore-species],[data-explore-group],[data-review-group]",
      );
      if (!b) return;
      void this.guard(async () => {
        if (b.dataset.tab) {
          this.tab = b.dataset.tab;
          if (this.tab === "Explore") this.map.select(undefined);
          this.panel();
          return;
        }
        if (b.dataset.exploreGroup) {
          this.exploreGroup = b.dataset.exploreGroup;
          this.exploreOrder = "All";
          this.panel();
          return;
        }
        if (b.dataset.reviewGroup) {
          this.reviewGroup = b.dataset.reviewGroup;
          this.panel();
          return;
        }
        if (b.dataset.exploreSpecies) {
          this.exploreSpecies = b.dataset.exploreSpecies;
          this.map.select({
            records: this.pack.records.filter(
              (r) => r.taxon_id === this.exploreSpecies,
            ),
          } as ScreeningRow);
          this.panel();
          return;
        }
        if (b.dataset.species) {
          this.selected = b.dataset.species;
          this.map.select(this.rows().find((r) => r.id === this.selected));
          this.panel();
          return;
        }
        await this.action(b.dataset.action!);
      });
    };
    if (!this.store.editable)
      this.root
        .querySelectorAll<
          HTMLInputElement | HTMLButtonElement
        >('[data-action="new"],[data-action="example"],[data-action="draw"],[data-action="finish"],#backup')
        .forEach((el) => (el.disabled = true));
    this.renderMapKey("imagery");
    this.panel();
  }
  private renderMapKey(id: string) {
    const host = this.root.querySelector<HTMLElement>("#map-key")!;
    const layer = this.pack.layers.find((layer) => layer.id === id);
    host.innerHTML = layer
      ? `<details><summary>${esc(layer.title)} · map key (${layer.legend.length} classes)</summary><div class="map-key-list">${layer.legend.map((entry) => `<div><i style="background:${esc(entry.color)}"></i><span>${esc(entry.label)}</span></div>`).join("")}</div><p>${esc(layer.note)} ${link(layer.source, "Source")}</p></details>`
      : "";
  }
  private async guard(fn: () => void | Promise<void>) {
    try {
      await fn();
    } catch (e) {
      this.message = String(e instanceof Error ? e.message : e);
      const el = this.root.querySelector("#save-state");
      if (el) {
        el.textContent = this.message;
        el.setAttribute("role", "alert");
      }
    }
  }
  private boundary(value: unknown) {
    if (!this.store.editable) throw Error("Your workspace role is read-only.");
    const p = parsePolygon(value);
    if (coverage(p, this.pack.manifest.bbox, 0).outside)
      throw Error(
        "Boundary exceeds this regional pack. Prepare a regional pack for the new location.",
      );
    this.p.aoi = p;
    this.p.example = false;
    this.save("Changed project boundary; prior decisions require review", true);
    this.map.update(this.p);
    this.panel();
  }
  private panel() {
    this.root
      .querySelectorAll<HTMLElement>("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b.dataset.tab === this.tab));
    const p = this.p,
      rows = this.rows();
    const el = this.root.querySelector("#panel")!;
    if (this.tab === "Explore") {
      el.innerHTML = this.exploreContent();
      el.querySelector<HTMLSelectElement>("#explore-radius")?.addEventListener(
        "change",
        (e) => {
          this.exploreRadius = Number((e.target as HTMLSelectElement).value);
          this.map.setFocus(this.explorePoint, this.exploreRadius);
          this.panel();
        },
      );
      el.querySelector<HTMLSelectElement>("#explore-order")?.addEventListener(
        "change",
        (e) => {
          this.exploreOrder = (e.target as HTMLSelectElement).value;
          this.panel();
        },
      );
      el.querySelector<HTMLInputElement>("#explore-search")?.addEventListener(
        "input",
        (e) => {
          this.exploreQuery = (e.target as HTMLInputElement).value;
          this.panel();
          this.root.querySelector<HTMLInputElement>("#explore-search")?.focus();
        },
      );
      return;
    }
    el.innerHTML = `<div class="panel-heading"><p class="eyebrow">${p.example ? "WORKED EXAMPLE · NOT A CLIENT ASSESSMENT" : esc(p.status) + " · REVISION " + p.revision}</p><h1>${esc(p.name)}</h1><div class="metrics"><span><b>${p.aoi ? fmt(areaHa(p.aoi)) : "—"}</b>ha footprint</span><span><b>${rows.length}</b>species to review</span><span><b>${rows.filter((r) => r.review.decision === "Unreviewed").length}</b>unreviewed</span></div></div>${this.content(rows)}`;
    if (!this.store.editable)
      el.querySelectorAll<
        | HTMLInputElement
        | HTMLButtonElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >(
        "form input, form button, form select, form textarea, input[type=file]",
      ).forEach((control) => (control.disabled = true));
    el.querySelectorAll("form").forEach(
      (f) =>
        (f.onsubmit = (e) => {
          e.preventDefault();
          void this.guard(async () => {
            await this.submit(f.id, new FormData(f));
            this.panel();
            this.map.update(this.p);
            this.root.querySelector("#save-state")!.textContent = this.message;
          });
        }),
    );
    el.querySelectorAll<HTMLInputElement>("input[type=file]").forEach(
      (input) =>
        (input.onchange = () =>
          void this.guard(async () => {
            if (!this.store.editable)
              throw Error("Your workspace role is read-only.");
            const file = input.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) throw Error("Import exceeds the 2 MB project import limit. Split large surveys into projects.");
            if (input.id === "boundary-file") this.boundary(await readJSON(file));
            else {
              const field = file.name.toLowerCase().endsWith(".csv") ? parseFieldCSV(await file.text()) : parseField(await readJSON(file));
              if (
                field.some((f) => this.p.field.some((old) => old.id === f.id))
              )
                throw Error(
                  "Import contains field IDs already in this project.",
                );
              this.validateFieldCoverage(field);
              this.p.field.push(...field);
              this.save(`Imported ${field.length} field features`, true);
              this.map.update(this.p);
              this.panel();
            }
          })),
    );
    el.querySelector<HTMLInputElement>("#species-search")?.addEventListener(
      "input",
      (e) => {
        this.query = (e.target as HTMLInputElement).value;
        const q = this.query.toLowerCase();
        el.querySelectorAll<HTMLElement>("[data-species]").forEach(
          (r) =>
            (r.hidden = !(
              r.textContent?.toLowerCase().includes(q) &&
              (this.reviewGroup === "All" ||
                r.dataset.group === this.reviewGroup)
            )),
        );
      },
    );
  }
  private content(rows: ScreeningRow[]) {
    const p = this.p;
    if (this.tab === "Explore") return this.exploreContent();
    if (this.tab === "Site")
      return `<h2>Project definition</h2><form id="site-form">${this.input("name", "Project name", p.name)}${this.input("client", "Client / project owner", p.client)}${this.input("reference", "Project reference", p.reference)}${this.text("purpose", "Purpose and scope", p.purpose)}${this.input("buffer", "Search distance (m · 0–10,000)", p.buffer, "number")}${this.input("since", "Earliest occurrence date", p.since, "date")}<button class="primary">Save project</button></form><h2>Boundary</h2><p>Draw on the map or import one WGS84 GeoJSON Polygon. Holes are supported. Prepared coverage is limited to this Mojave region.</p><label class="file-button">Import boundary<input id="boundary-file" type="file" accept=".json,.geojson"></label><details><summary>Enter bounding coordinates</summary><form id="bbox-form">${this.input("west", "West longitude", -114.625, "number")}${this.input("south", "South latitude", 37.2, "number")}${this.input("east", "East longitude", -114.57, "number")}${this.input("north", "North latitude", 37.245, "number")}<button>Apply rectangular boundary</button></form></details><p class="note">${this.store.cloud ? "Projects are saved to your consultancy workspace. Save status appears above; export private backups only to authorized storage." : "This is a local demo. Projects are stored in this browser. Sign in to a workspace for shared server storage."}</p>`;
    if (this.tab === "Species") return this.projectSpeciesContent(rows);
    if (this.tab === "Habitat")
      return `<h2>Habitat context</h2><p>Nominal 30 m LANDFIRE products, resampled by nearest neighbour to approximately 31 m. Pixel-center area estimates may miss small features. BpS describes potential vegetation, not present habitat.</p>${
        p.aoi
          ? this.pack.layers
              .map((l) => {
                const h = summarizeHabitat(p.aoi!, l);
                return `<details open><summary>${esc(l.title)}</summary>${attributes(
                  [
                    { label: "Interpretation", value: l.note },
                    {
                      label: "Source resolution",
                      value: `${l.source_resolution_m} m`,
                    },
                    { label: "Analysis cell", value: `${fmt(l.cell_m, 1)} m` },
                    { label: "Sampled cells", value: h.totalCells },
                    { label: "NoData cells", value: h.nodata },
                    {
                      label: "Source",
                      value: "",
                      valueHtml: link(l.source, "LANDFIRE product"),
                    },
                  ],
                )}<div class="attribute-table-wrap"><table class="attribute-table"><thead><tr><th>Mapped class</th><th>Code</th><th>Cells</th><th>Area (ha)</th><th>Footprint (%)</th></tr></thead><tbody>${h.classes.map((c) => `<tr><td><i class="class-swatch" style="background:${esc(c.color)}"></i>${esc(c.label)}</td><td>${c.code}</td><td>${c.cells}</td><td>${fmt(c.ha)}</td><td>${fmt(c.percent)}</td></tr>`).join("")}</tbody></table></div></details>`;
              })
              .join("")
          : "<p>Define a boundary to calculate habitat areas.</p>"
      }<form id="habitat-form">${this.text("notes", "Interpretation, field checks and limitations", p.notes)}${this.check("checked", "Habitat evidence and limitations reviewed", p.habitatChecked)}<button>Save habitat review</button></form>`;
    if (this.tab === "Field")
      return `<h2>Field evidence</h2><p>Import points as CSV, or points, survey lines and polygons as WGS84 GeoJSON. CSV coordinates must be decimal longitude and latitude. Required properties: species/name, date (YYYY-MM-DD), observer. Include method, effort, notes and sensitivity. Submitted identifications and survey coverage require professional verification.</p><label class="file-button">Import field data<input id="field-file" type="file" accept=".json,.geojson,.csv"></label><button data-action="template">GeoJSON template</button><button data-action="csv-template">CSV template</button><form id="field-form">${this.input("name", "Species / evidence name")}${this.input("longitude", "Longitude", "", "number")}${this.input("latitude", "Latitude", "", "number")}${this.input("date", "Observation date", "", "date")}${this.input("observer", "Observer")}<label>Evidence type<select name="kind" aria-label="Evidence type"><option>Observation</option><option>Burrow / sign</option><option>Nest</option></select></label>${this.input("method", "Method")}${this.input("effort", "Effort (duration, distance or area)")}${this.text("notes", "Notes")}${this.check("sensitive", "Sensitive: omit from shared GIS and report", true)}<button>Add observation</button></form><h3>${p.field.length} entries</h3>${p.field
        .map(
          (f) =>
            `<article><h4>${esc(f.name)}</h4>${attributes([
              { label: "Observation date", value: f.date },
              { label: "Observer", value: f.observer },
              { label: "Evidence type", value: f.kind },
              { label: "Method", value: f.method || "Not recorded" },
              { label: "Effort", value: f.effort || "Not recorded" },
              {
                label: "Sensitivity",
                value: f.sensitive ? "Sensitive" : "Shareable",
              },
              { label: "Notes", value: f.notes || "None" },
            ])}<button data-action="remove-field:${esc(f.id)}">Remove field entry</button></article>`,
        )
        .join("")}`;
    if (this.tab === "Review")
      return `<h2>Consultant review</h2><p>Agency checks must be performed by the reviewer. ${link("https://ipac.ecosphere.fws.gov/", "USFWS IPaC")} · ${link("https://www.ndow.org/", "Nevada Department of Wildlife")}</p><form id="review-form">${this.input("reviewer", "Reviewing biologist", p.reviewer)}${this.text("agencyNotes", "Sources checked, dates, findings and outstanding gaps", p.agencyNotes)}${this.check("agencyChecked", "Relevant agency and regional sources checked", p.agencyChecked)}<button>Save review details</button></form><h3>Readiness</h3><ul>${
        issues(p, this.pack, rows)
          .map((x) => `<li>${esc(x)}</li>`)
          .join("") || "<li>All recorded review gates are complete.</li>"
      }</ul><button data-action="reviewed" class="primary">Record completed consultant review</button><p class="note">This records review of this revision. It does not confer regulatory approval. Evidence changes reopen species decisions and source checks.</p>`;
    return `<h2>Deliverables</h2><p>Exports preserve review state and limitations. Sensitive field coordinates are excluded from shared GIS and report. The private project backup includes all field coordinates.</p><div class="downloads"><button data-action="report">Printable report (.html)</button><button data-action="species-csv">Species assessment (.csv)</button><button data-action="evidence-csv">Occurrence attribution (.csv)</button><button data-action="geojson">Shared project GIS (.geojson)</button><button data-action="backup">Private project backup (.json)</button></div><h3>Source pack</h3>${attributes(
      [
        { label: "Reusable public records", value: this.pack.records.length },
        {
          label: "Records excluded by license",
          value: Object.values(this.pack.excluded_licenses).reduce(
            (a, b) => a + b,
            0,
          ),
        },
        { label: "Pack build date", value: this.pack.created_at },
        { label: "Manifest SHA-256", value: this.pack.manifest_sha256 },
      ],
    )}<ul>${this.pack.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
  }
  private projectSpeciesContent(rows: ScreeningRow[]) {
    const groupChoices = [...new Set(rows.map((row) => row.group))].sort(
      (a, b) => a.localeCompare(b),
    );
    const groups = `<div class="earth-groups" role="group" aria-label="Project species groups"><button data-review-group="All" class="${this.reviewGroup === "All" ? "active" : ""}"><span>✦ All species</span><b>${rows.length}</b></button>${groupChoices.map((group) => `<button data-review-group="${esc(group)}" class="${this.reviewGroup === group ? "active" : ""}"><span>${groupIcons[group] || "✦"} ${esc(group)}</span><b>${rows.filter((row) => row.group === group).length}</b></button>`).join("")}</div>`;
    const list = rows
      .map((row) => {
        const species = this.pack.species.find((item) => item.id === row.id);
        const photo = species && verifiedPhoto(this.media, species);
        const thumb = photo
          ? `<img src="/screening/mojave-001/${esc(photo.image)}" alt="" loading="lazy">`
          : `<span aria-hidden="true">${groupIcons[row.group] || "✦"}</span>`;
        const hidden =
          (this.reviewGroup !== "All" && row.group !== this.reviewGroup) ||
          !`${row.name} ${row.common} ${row.group} ${row.review.decision}`
            .toLowerCase()
            .includes(this.query.toLowerCase());
        return `<button data-species="${esc(row.id)}" data-group="${esc(row.group)}" class="species-row ${row.id === this.selected ? "selected" : ""}" ${hidden ? "hidden" : ""}><span class="species-thumb">${thumb}</span><span class="species-meta"><strong>${esc(row.name)}</strong><span>${esc(row.common || row.group)}</span><small>${row.records.length} public · ${row.uncertain} uncertain · ${row.fieldCount} field · ${esc(row.review.decision)}</small></span></button>`;
      })
      .join("");
    const selected = rows.find((row) => row.id === this.selected);
    return `<h2>Species evidence and assessment</h2><p>Candidate references remain visible without occurrence records. This is a starting list, not an exhaustive agency list. Counts include uncertain records.</p>${groups}<input id="species-search" aria-label="Search species" placeholder="Search name, group or decision" value="${esc(this.query)}"><div class="species-list">${list}</div>${selected ? this.speciesDetail(selected) : "<p>Select a species to inspect its evidence and record a decision.</p>"}<details><summary>Add a candidate species</summary><form id="candidate-form">${this.input("name", "Scientific name")}${this.input("common", "Common name")}${this.input("group", "Taxonomic group")}${this.text("reason", "Reason to include")}${this.text("habitat", "Habitat association / limitations")}${this.input("source", "Reference URL", "", "url")}<button>Add cited candidate</button></form></details>`;
  }
  private exploreContent() {
    const near = nearbyRecords(
      this.pack,
      this.explorePoint,
      this.exploreRadius,
    );
    const all = regionalSpecies(this.pack);
    const nearbyIds = new Set(near.map((item) => item.record.taxon_id));
    const available =
      this.exploreScope === "point"
        ? all.filter((item) => nearbyIds.has(item.species.id))
        : all;
    const groupChoices = [
      "Birds",
      "Plants",
      "Mammals",
      "Reptiles",
      "Arthropods",
    ].filter((group) => available.some((item) => item.species.group === group));
    const groupButtons = `<div class="earth-groups" role="group" aria-label="Species groups"><button data-explore-group="All" class="${this.exploreGroup === "All" ? "active" : ""}"><span>✦ All species</span><b>${available.length}</b></button>${groupChoices.map((group) => `<button data-explore-group="${esc(group)}" class="${this.exploreGroup === group ? "active" : ""}"><span>${groupIcons[group] || "•"} ${esc(group)}</span><b>${available.filter((item) => item.species.group === group).length}</b></button>`).join("")}</div>`;
    const groupSpecies = available.filter(
      (item) =>
        this.exploreGroup === "All" || item.species.group === this.exploreGroup,
    );
    const orders = [
      ...new Set(groupSpecies.map((item) => taxonOrder(item.species))),
    ].sort((a, b) => orderLabel(a).localeCompare(orderLabel(b)));
    const orderPicker = `<label class="earth-order">Taxonomic order<select id="explore-order" aria-label="Taxonomic order"><option value="All">All orders</option>${orders.map((order) => `<option value="${esc(order)}" ${this.exploreOrder === order ? "selected" : ""}>${esc(orderLabel(order))} · ${groupSpecies.filter((item) => taxonOrder(item.species) === order).length}</option>`).join("")}</select></label>`;
    const q = this.exploreQuery.trim().toLowerCase();
    const displayed = groupSpecies.filter(
      (item) =>
        (this.exploreOrder === "All" ||
          taxonOrder(item.species) === this.exploreOrder) &&
        (!q ||
          `${item.species.name} ${item.species.common_name} ${item.species.group} ${taxonFamily(item.species)} ${taxonOrder(item.species)}`
            .toLowerCase()
            .includes(q)),
    );
    const selected = all.find(
      (item) => item.species.id === this.exploreSpecies,
    );
    const [lon, lat] = this.explorePoint;
    const samples = this.pack.layers.map((layer) =>
      sampleHabitat(layer, this.explorePoint),
    );
    const sampleCards = samples
      .map(
        (sample) =>
          `<div class="earth-layer"><span class="layer-chip" style="background:${esc(sample.layer.legend.find((entry) => entry.code === sample.code)?.color || "#889b8a")}"></span><div><h3>${esc(sample.layer.title)}</h3>${attributes(
            [
              { label: "Mapped class", value: sample.label },
              {
                label: "Class code",
                value:
                  sample.code === null
                    ? "NoData / outside coverage"
                    : sample.code,
              },
              {
                label: "Source resolution",
                value: `${sample.layer.source_resolution_m} m`,
              },
              {
                label: "Analysis cell",
                value: `${fmt(sample.layer.cell_m, 1)} m`,
              },
              { label: "Interpretation", value: sample.layer.note },
              {
                label: "Source",
                value: "",
                valueHtml: link(sample.layer.source, "LANDFIRE product"),
              },
            ],
          )}</div></div>`,
      )
      .join("");
    const listed = displayed
      .map(({ species, records }) => {
        const photo = verifiedPhoto(this.media, species);
        const thumbnail = photo
          ? `<img src="/screening/mojave-001/${esc(photo.image)}" alt="" loading="lazy">`
          : `<span aria-hidden="true">${groupIcons[species.group] || "✦"}</span>`;
        return `<button class="earth-species ${species.id === selected?.species.id ? "selected" : ""}" data-explore-species="${esc(species.id)}"><span class="earth-thumb">${thumbnail}</span><span class="earth-species-name"><strong>${esc(species.common_name && species.common_name !== species.name ? species.common_name : species.name)}</strong><em>${esc(species.name)}</em><small>${esc(taxonFamily(species))}</small></span><span class="earth-species-count"><b>${records.length}</b>records</span></button>`;
      })
      .join("");
    const photo = selected && verifiedPhoto(this.media, selected.species);
    const photoDetail =
      selected && photo
        ? `<figure class="earth-photo"><img src="/screening/mojave-001/${esc(photo.image)}" alt="Reference image of ${esc(selected.species.name)}" loading="lazy"><figcaption>${attributes(
            [
              {
                label: "Image role",
                value: "Reference photo; not location evidence",
              },
              { label: "Image processing", value: "Resized WebP copy" },
                { label: "Credit", value: photo.credit },
              {
                label: "License",
                value: "",
                valueHtml: link(
                  photo.license === "CC0"
                    ? "https://creativecommons.org/publicdomain/zero/1.0/"
                    : "https://creativecommons.org/licenses/by/",
                  photo.license,
                ),
              },
              {
                label: "Original image",
                value: "",
                valueHtml: link(photo.source, "View source"),
              },
            ],
          )}</figcaption></figure>`
        : `<div class="earth-photo-missing"><span aria-hidden="true">${selected ? groupIcons[selected.species.group] || "✦" : "✦"}</span><small>No verified reusable photo in this pack</small></div>`;
    const reference =
      selected &&
      regionalCandidates.find(
        (c) => c.name.toLowerCase() === selected.species.name.toLowerCase(),
      );
    const selectedNear = selected
      ? near.filter((item) => item.record.taxon_id === selected.species.id)
      : [];
    const dates =
      selected?.records
        .map((r) => r.event_date)
        .filter((date): date is string => Boolean(date))
        .sort() || [];
    const detail = selected
      ? `<article class="earth-detail">${photoDetail}<p class="eyebrow">RECORDED TAXON</p><h3>${esc(selected.species.name)}</h3>${attributes([{ label: "Scientific name", value: selected.species.name }, { label: "Common name", value: selected.species.common_name || "Not recorded" }, { label: "Taxonomic group", value: selected.species.group }, { label: "Order", value: orderLabel(taxonOrder(selected.species)) }, { label: "Family", value: taxonFamily(selected.species) }, { label: "Rank", value: selected.species.rank }, { label: "Regional public records", value: selected.records.length }, { label: "Records intersecting search", value: selectedNear.length }, { label: "Earliest record", value: dates[0] || "Unknown" }, { label: "Latest record", value: dates.at(-1) || "Unknown" }, { label: "Habitat association", value: reference?.habitat || "Not curated in this pack" }, ...(reference ? [{ label: "Habitat reference", value: "", valueHtml: link(reference.source, reference.sourceTitle) }] : [])])}<p class="earth-caveat">Occurrences indicate observations, not a distribution or absence map. Confirm habitat associations against authoritative accounts and field evidence.</p><h4>Nearby public evidence</h4>${
          selectedNear.length
            ? selectedNear
                .slice(0, 12)
                .map(
                  ({ record, distance, uncertainty, overlaps }) =>
                    `<div class="earth-record">${attributes([{ label: "Observation date", value: record.event_date || "Undated" }, { label: "Public point distance", value: `${fmt(distance / 1000, 2)} km` }, { label: "Search relationship", value: overlaps ? "Uncertainty/generalized overlap" : "Public point within radius" }, { label: "Coordinate uncertainty", value: record.uncertainty_m ? `${fmt(record.uncertainty_m)} m` : "Not reported" }, { label: "Generalization", value: record.generalization_m ? `${fmt(record.generalization_m)} m` : "Not reported" }, { label: "Search uncertainty radius", value: uncertainty ? `${fmt(uncertainty)} m` : "Not reported" }, { label: "Record basis", value: record.basis_of_record }, { label: "License", value: record.license }, { label: "Dataset", value: "", valueHtml: link("https://www.gbif.org/dataset/" + record.source_dataset, "GBIF dataset") }, ...(record.source_url && !record.is_sensitive && !record.is_obscured ? [{ label: "Record", value: "", valueHtml: link(record.source_url, "View source") }] : [])])}</div>`,
                )
                .join("")
            : "<p>No public record intersects this search. This does not establish absence.</p>"
        }</article>`
      : "";
    return `<div class="earth-panel"><p class="eyebrow">EXPLORE / MOJAVE REGIONAL DATA</p><h1>Read the landscape</h1><p>Click anywhere on the map to inspect what is mapped there. Data are limited to this prepared region.</p><div class="earth-location">${attributes(
      [
        { label: "Longitude", value: `${lon.toFixed(5)}°` },
        { label: "Latitude", value: `${lat.toFixed(5)}°` },
        { label: "Coordinate system", value: "WGS84 (EPSG:4326)" },
        { label: "Raster lookup", value: "UTM zone 11N (EPSG:32611)" },
      ],
    )}</div><div class="earth-overview">${attributes([
      { label: "Taxa with intersecting evidence", value: nearbyIds.size },
      {
        label: "Mapped habitat layers",
        value: samples.filter((s) => s.code !== null).length,
      },
    ])}</div><h2>Mapped habitat at this point</h2>${sampleCards}<p class="earth-caveat">These are classified raster cells, not field-verified habitat or individual trees. BpS represents potential vegetation.</p><div class="earth-row"><h2>Species records</h2><select id="explore-radius" aria-label="Search radius"><option value="1000" ${this.exploreRadius === 1000 ? "selected" : ""}>1 km</option><option value="2000" ${this.exploreRadius === 2000 ? "selected" : ""}>2 km</option><option value="5000" ${this.exploreRadius === 5000 ? "selected" : ""}>5 km</option></select></div>${attributes(
      [
        { label: "Search radius", value: `${this.exploreRadius / 1000} km` },
        { label: "Intersecting public records", value: near.length },
        { label: "Taxa in search", value: nearbyIds.size },
      ],
    )}<p class="earth-caveat">Generalized coordinates and missing uncertainty limit precision.</p><div class="earth-toggle"><button data-action="explore-point" class="${this.exploreScope === "point" ? "active" : ""}">Near this point</button><button data-action="explore-region" class="${this.exploreScope === "region" ? "active" : ""}">Whole region · ${all.length} taxa</button></div>${groupButtons}${orderPicker}<input id="explore-search" aria-label="Find a regional species" placeholder="Find a species or group" value="${esc(this.exploreQuery)}"><div class="earth-species-list">${listed || "<p>No matching record in this view. Check the whole region or another location.</p>"}</div>${detail}<p class="earth-caveat">Public records are incomplete. The regional catalogue is not an agency species list. A project screening requires a boundary, habitat review, field context and current agency checks.</p><button data-action="open-site" class="primary">Start a project screening</button></div>`;
  }
  private speciesDetail(r: ScreeningRow) {
    const species = this.pack.species.find((item) => item.id === r.id);
    const photo = species && verifiedPhoto(this.media, species);
    const figure = photo
      ? `<figure class="earth-photo"><img src="/screening/mojave-001/${esc(photo.image)}" alt="Reference image of ${esc(r.name)}" loading="lazy"><figcaption>${attributes(
          [
            {
              label: "Image role",
              value: "Reference photo; not site evidence",
            },
            { label: "Image processing", value: "Resized WebP copy" },
                { label: "Credit", value: photo.credit },
            {
              label: "License",
              value: "",
              valueHtml: link(
                photo.license === "CC0"
                  ? "https://creativecommons.org/publicdomain/zero/1.0/"
                  : "https://creativecommons.org/licenses/by/",
                photo.license,
              ),
            },
            {
              label: "Original image",
              value: "",
              valueHtml: link(photo.source, "View source"),
            },
          ],
        )}</figcaption></figure>`
      : "";
    return `<article>${figure}<h3>${esc(r.name)}</h3>${attributes([
      { label: "Scientific name", value: r.name },
      { label: "Common name", value: r.common || "Not recorded" },
      { label: "Taxonomic group", value: r.group },
      ...(species
        ? [
            { label: "Order", value: orderLabel(taxonOrder(species)) },
            { label: "Family", value: taxonFamily(species) },
          ]
        : []),
      { label: "Records inside footprint", value: r.inside },
      { label: "Nearby records", value: r.nearby },
      { label: "Uncertain records", value: r.uncertain },
      { label: "Field entries", value: r.fieldCount },
      { label: "Latest public record", value: r.latest || "No dated record" },
      ...(r.candidate
        ? [
            { label: "Candidate basis", value: r.candidate.reason },
            { label: "Habitat association", value: r.candidate.habitat },
            {
              label: "Candidate reference",
              value: "",
              valueHtml: link(r.candidate.source, r.candidate.sourceTitle),
            },
          ]
        : []),
    ])}<details><summary>Public occurrence evidence (${r.records.length})</summary>${r.records.map((o) => `<div class="earth-record">${attributes([{ label: "Observation date", value: o.event_date || "Undated" }, { label: "Coordinate uncertainty", value: o.uncertainty_m ? `${fmt(o.uncertainty_m)} m` : "Not reported" }, { label: "Generalization", value: o.generalization_m ? `${fmt(o.generalization_m)} m` : "Not reported" }, { label: "Record basis", value: o.basis_of_record }, { label: "License", value: o.license }, { label: "Dataset", value: "", valueHtml: link("https://www.gbif.org/dataset/" + o.source_dataset, "GBIF dataset") }, ...(o.source_url && !o.is_sensitive && !o.is_obscured ? [{ label: "Record", value: "", valueHtml: link(o.source_url, "View source") }] : [])])}</div>`).join("")}</details><form id="decision-form"><label>Decision<select name="decision" aria-label="Decision">${decisions.map((d) => `<option ${d === r.review.decision ? "selected" : ""}>${d}</option>`).join("")}</select></label>${this.text("rationale", "Evidence-based rationale", r.review.rationale)}${this.text("action", "Next action / survey need", r.review.action)}${this.input("reviewer", "Reviewing biologist", r.review.reviewer || this.p.reviewer)}<button>Save species decision</button></form></article>`;
  }
  private validateFieldCoverage(records: Project["field"]) {
    const [w, s, e, n] = this.pack.manifest.bbox;
    for (const f of records) {
      const coords =
        f.geometry.type === "Point"
          ? [f.geometry.coordinates]
          : f.geometry.type === "LineString"
            ? f.geometry.coordinates
            : f.geometry.coordinates.flat();
      if (coords.some(([x, y]) => x < w || x > e || y < s || y > n))
        throw Error(
          "Field evidence lies outside the prepared regional pack. Verify its coordinates or prepare coverage for that location.",
        );
    }
  }
  private async submit(id: string, f: FormData) {
    if (!this.store.editable) throw Error("Your workspace role is read-only.");
    const v = (n: string) => String(f.get(n) || "").trim();
    if (id === "site-form") {
      const b = Number(v("buffer"));
      if (!v("name") || !Number.isFinite(b) || b < 0 || b > 10000)
        throw Error(
          "Provide a project name and search distance from 0 to 10,000 m.",
        );
      const changed = b !== this.p.buffer || v("since") !== this.p.since;
      Object.assign(this.p, {
        name: v("name"),
        client: v("client"),
        reference: v("reference"),
        purpose: v("purpose"),
        buffer: b,
        since: v("since"),
      });
      this.save("Updated project definition", changed);
    } else if (id === "bbox-form") {
      const [w, s, e, n] = ["west", "south", "east", "north"].map((x) =>
        Number(v(x)),
      );
      if (w >= e || s >= n)
        throw Error("West must be less than east; south less than north.");
      this.boundary(bboxPolygon(w, s, e, n));
    } else if (id === "candidate-form") {
      if (!v("name") || !v("reason") || !/^https?:\/\//.test(v("source")))
        throw Error("Name, inclusion reason and reference URL are required.");
      if (
        this.rows().some(
          (r) => r.name.toLowerCase() === v("name").toLowerCase(),
        )
      )
        throw Error("Species already exists in the screening list.");
      this.p.candidates.push({
        id: crypto.randomUUID(),
        name: v("name"),
        common: v("common"),
        group: v("group"),
        reason: v("reason"),
        habitat: v("habitat"),
        source: v("source"),
        sourceTitle: "Consultant reference",
        checked: new Date().toISOString().slice(0, 10),
        origin: "consultant",
      });
      this.save("Added cited candidate", true);
    } else if (id === "decision-form") {
      const review = {
        decision: v("decision") as Decision,
        rationale: v("rationale"),
        action: v("action"),
        reviewer: v("reviewer"),
        updated: new Date().toISOString(),
      };
      validateReview(review);
      this.p.reviews[this.selected] = review;
      this.save(
        "Reviewed species " +
          this.rows().find((r) => r.id === this.selected)?.name,
      );
    } else if (id === "habitat-form") {
      this.p.notes = v("notes");
      this.p.habitatChecked = f.has("checked");
      this.save("Updated habitat interpretation");
    } else if (id === "review-form") {
      this.p.reviewer = v("reviewer");
      this.p.agencyNotes = v("agencyNotes");
      this.p.agencyChecked = f.has("agencyChecked");
      this.save("Updated consultant source checks");
    } else if (id === "field-form") {
      if (!v("longitude") || !v("latitude"))
        throw Error("Enter observation coordinates.");
      const records = parseField({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [Number(v("longitude")), Number(v("latitude"))],
            },
            properties: {
              name: v("name"),
              date: v("date"),
              observer: v("observer"),
              kind: v("kind"),
              method: v("method"),
              effort: v("effort"),
              notes: v("notes"),
              sensitive: f.has("sensitive"),
            },
          },
        ],
      });
      this.validateFieldCoverage(records);
      this.p.field.push(...records);
      this.save("Added field observation", true);
    }
  }
  private async action(a: string) {
    if (a === "team") {
      await this.store.account(this.root, this.p);
      return;
    }
    if (
      !this.store.editable &&
      (["new", "example", "draw", "finish", "reviewed"].includes(a) ||
        a.startsWith("remove-field:"))
    )
      throw Error("Your workspace role is read-only.");
    if (a === "explore-point" || a === "explore-region") {
      this.exploreScope = a === "explore-point" ? "point" : "region";
      this.panel();
      return;
    }
    if (a === "open-site") {
      this.tab = "Site";
      this.panel();
      return;
    }
    if (a.startsWith("remove-field:")) {
      const id = a.slice(13);
      this.p.field = this.p.field.filter((f) => f.id !== id);
      this.save("Removed field entry; reviews reopened", true);
      this.map.update(this.p);
      this.panel();
      return;
    }
    if (a === "new" || a === "example") {
      this.p = newProject(a === "example");
      if (a === "example")
        this.p.aoi = bboxPolygon(-114.625, 37.2, -114.57, 37.245);
      this.projects.push(this.p);
      this.persistProjects();
      this.selected = "";
      this.tab = "Site";
      this.layout();
      return;
    }
    if (a === "draw") this.map.draw();
    if (a === "finish") this.map.finish();
    if (a === "undo") this.map.undo();
    if (a === "cancel") this.map.cancel();
    if (a === "fit") this.map.fit();
    if (a === "home") this.map.home();
    if (a === "in") this.map.zoom(0.7);
    if (a === "out") this.map.zoom(1.4);
    if (a === "reviewed") {
      const gaps = issues(this.p, this.pack);
      if (gaps.length) throw Error(gaps.join(" "));
      this.save("Consultant review completed");
      this.p.status = "Reviewed";
      this.p.reviewedRevision = this.p.revision;
      this.persistProjects();
      this.panel();
    }
    const rows = this.rows(),
      base = this.p.name.replace(/[^a-z0-9_-]+/gi, "-");
    if (a === "backup")
      download(base + "-PRIVATE.json", JSON.stringify(this.p, null, 2));
    if (a === "species-csv")
      download(base + "-species.csv", speciesCSV(rows), "text/csv");
    if (a === "evidence-csv")
      download(base + "-evidence.csv", evidenceCSV(rows), "text/csv");
    if (a === "geojson")
      download(
        base + ".geojson",
        JSON.stringify(projectGeoJSON(this.p, rows), null, 2),
      );
    if (a === "report")
      download(
        base + "-report.html",
        report(
          this.p,
          this.pack,
          rows,
          this.p.aoi
            ? this.pack.layers.map((l) => summarizeHabitat(this.p.aoi!, l))
            : [],
          this.map.exportSVG(rows),
        ),
        "text/html",
      );
    if (a === "csv-template") download("field-template.csv", fieldCSVTemplate, "text/csv");
    if (a === "template")
      download(
        "field-template.geojson",
        JSON.stringify(
          {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: { type: "Point", coordinates: [-114.6, 37.22] },
                properties: {
                  name: "REPLACE with identified species",
                  date: "2026-09-29",
                  observer: "REPLACE",
                  method: "Visual observation",
                  effort: "Record survey effort",
                  notes: "TEMPLATE ONLY — replace all example evidence",
                  sensitive: true,
                },
              },
            ],
          },
          null,
          2,
        ),
      );
  }
}
