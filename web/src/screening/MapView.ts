import type { Pack, Project, ScreeningRow, XY, Polygon } from "./types";
import { project, geographic } from "./geo";
import { esc } from "./utils";
export class MapView {
  private box = [0, 0, 1000, 1000];
  private points: XY[] = [];
  private drawing = false;
  private layer = "imagery";
  private showRecords = true;
  private row?: ScreeningRow;
  private focus?: XY;
  private focusRadius = 2000;
  private current!: Project;
  private svg!: SVGSVGElement;
  private pan?: { x: number; y: number; box: number[] };
  private moved = false;
  constructor(
    private host: HTMLElement,
    private pack: Pack,
    private onBoundary: (p: Polygon) => void,
    private onPick: (p: XY) => void,
  ) {
    this.box[3] =
      (1000 * pack.manifest.terrain.height_m) / pack.manifest.terrain.width_m;
  }
  setFocus(point: XY, radius = 2000) {
    this.focus = point;
    this.focusRadius = radius;
    this.render();
  }
  setLayer(id: string) {
    this.layer = id;
    this.render();
  }
  setRecords(v: boolean) {
    this.showRecords = v;
    this.render();
  }
  select(row?: ScreeningRow) {
    this.row = row;
    this.render();
  }
  update(p: Project) {
    this.current = p;
    this.render();
  }
  draw() {
    this.drawing = true;
    this.points = [];
    this.render();
  }
  cancel() {
    this.drawing = false;
    this.points = [];
    this.render();
  }
  undo() {
    this.points.pop();
    this.render();
  }
  finish() {
    if (this.points.length < 3)
      throw Error("Add at least three boundary vertices.");
    this.onBoundary({
      type: "Polygon",
      coordinates: [[...this.points, this.points[0]]],
    });
    this.cancel();
  }
  zoom(f: number) {
    const [x, y, w, h] = this.box;
    const nw = Math.max(45, Math.min(1500, w * f));
    this.box = [x + (w - nw) / 2, y + (h - (h * nw) / w) / 2, nw, (h * nw) / w];
    this.render();
  }
  home() {
    this.box = [
      0,
      0,
      1000,
      (1000 * this.pack.manifest.terrain.height_m) /
        this.pack.manifest.terrain.width_m,
    ];
    this.render();
  }
  fit() {
    if (!this.current.aoi) return this.home();
    const xy = this.current.aoi.coordinates[0].map((p) => this.pixel(p)),
      xs = xy.map((p) => p[0]),
      ys = xy.map((p) => p[1]);
    const w = Math.max(80, Math.max(...xs) - Math.min(...xs)),
      h = Math.max(80, Math.max(...ys) - Math.min(...ys));
    const size = Math.max(w, h) * 1.35;
    this.box = [
      (Math.min(...xs) + Math.max(...xs) - size) / 2,
      (Math.min(...ys) + Math.max(...ys) - size) / 2,
      size,
      size,
    ];
    this.render();
  }
  exportSVG(rows: ScreeningRow[]) {
    const original = this.current,
      box = [...this.box],
      row = this.row,
      show = this.showRecords,
      points = this.points,
      drawing = this.drawing,
      focus = this.focus;
    this.current = {
      ...original,
      field: original.field.filter((f) => !f.sensitive),
    };
    this.row = { records: rows.flatMap((r) => r.records) } as ScreeningRow;
    this.showRecords = true;
    this.points = [];
    this.drawing = false;
    this.focus = undefined;
    this.fit();
    this.render();
    const copy = this.svg.cloneNode(true) as SVGSVGElement;
    copy.querySelectorAll("image").forEach((el) => el.remove());
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.removeAttribute("class");
    const [vx, vy, vw, vh] = this.box;
    const size = vw * 0.022,
      barUnits = vw * 0.2,
      metres = (barUnits * this.pack.manifest.terrain.width_m) / 1000;
    const annotation = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    annotation.innerHTML = `<text x="${vx + vw * 0.04}" y="${vy + vh * 0.08}" fill="white" font-family="sans-serif" font-size="${size}">N ↑ · UTM 11N</text><path d="M${vx + vw * 0.04},${vy + vh * 0.93}h${barUnits}" stroke="white" stroke-width="${vw * 0.004}"/><text x="${vx + vw * 0.04}" y="${vy + vh * 0.9}" fill="white" font-family="sans-serif" font-size="${size}">${Math.round(metres).toLocaleString()} m</text>`;
    copy.append(annotation);
    const result = copy.outerHTML;
    this.current = original;
    this.box = box;
    this.row = row;
    this.showRecords = show;
    this.points = points;
    this.drawing = drawing;
    this.focus = focus;
    this.render();
    return result;
  }
  private pixel(p: XY): XY {
    const [x, y] = project(p),
      [w, s, e, n] = this.pack.manifest.terrain.grid_bounds;
    return [((x - w) / (e - w)) * 1000, ((n - y) / (e - w)) * 1000];
  }
  private geo(p: XY): XY {
    const [w, s, e, n] = this.pack.manifest.terrain.grid_bounds;
    return geographic([
      w + (p[0] * (e - w)) / 1000,
      n - (p[1] * (e - w)) / 1000,
    ]);
  }
  private path(p: Polygon) {
    return p.coordinates
      .map((r) => "M" + r.map((x) => this.pixel(x).join(",")).join("L") + "Z")
      .join(" ");
  }
  private eventPoint(e: MouseEvent): XY {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      this.svg.getScreenCTM()!.inverse(),
    );
    return [p.x, p.y];
  }
  render() {
    if (!this.current) return;
    const p = this.current,
      m = this.pack.manifest,
      fullH = (1000 * m.terrain.height_m) / m.terrain.width_m,
      scale = m.terrain.width_m / 1000,
      base = `/worlds/${m.id}/terrain/imagery/tiles/`;
    const z = Math.min(
        5,
        Math.max(1, Math.ceil(Math.log2(1500 / this.box[2])) + 1),
      ),
      N = 2 ** z;
    let tiles = "";
    for (let x = 0; x < N; x++)
      for (let y = 0; y < N; y++) {
        const tx = (x * 1000) / N,
          ty = (y * fullH) / N,
          tw = 1000 / N,
          th = fullH / N;
        if (
          tx + tw < this.box[0] ||
          ty + th < this.box[1] ||
          tx > this.box[0] + this.box[2] ||
          ty > this.box[1] + this.box[3]
        )
          continue;
        tiles += `<image x="${tx}" y="${ty}" width="${tw + 0.02}" height="${th + 0.02}" href="${base}${z}/${x}/${y}.webp" preserveAspectRatio="none"/>`;
      }
    const layer = this.pack.layers.find((l) => l.id === this.layer);
    const records = this.row ? this.row.records : this.pack.records;
    const r = this.box[2] * 0.003;
    this.host.innerHTML = `<svg class="plan-map ${this.drawing ? "drawing" : ""}" role="img" aria-label="Project map. Use Draw boundary to add vertices." viewBox="${this.box.join(" ")}"><rect width="1000" height="${fullH}" fill="#283d38"/>${tiles}${layer ? `<image width="1000" height="${fullH}" href="/screening/${m.id}/${layer.image}" opacity=".82" preserveAspectRatio="none"/>` : ""}<path d="${this.path(
      {
        type: "Polygon",
        coordinates: [
          [
            [m.bbox[0], m.bbox[1]],
            [m.bbox[2], m.bbox[1]],
            [m.bbox[2], m.bbox[3]],
            [m.bbox[0], m.bbox[3]],
            [m.bbox[0], m.bbox[1]],
          ],
        ],
      },
    )}" fill="none" stroke="#fff8" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>${p.aoi ? `<path d="${this.path(p.aoi)}" fill="#edc75a15" fill-rule="evenodd" stroke="#eac96030" stroke-width="${(2 * p.buffer) / scale}" stroke-linejoin="round"/><path d="${this.path(p.aoi)}" fill="#f0cb5320" fill-rule="evenodd" stroke="#ffe278" stroke-width="2.5" vector-effect="non-scaling-stroke"/>` : ""}${
      this.showRecords
        ? records
            .map((o) => {
              const [x, y] = this.pixel([o.longitude, o.latitude]);
              return o.is_sensitive || o.is_obscured
                ? `<circle cx="${x}" cy="${y}" r="${Math.max(o.generalization_m || 0, o.uncertainty_m || 0, 5000) / scale}" fill="none" stroke="#bbabeb" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"><title>Generalized record · location uncertain</title></circle>`
                : `<circle cx="${x}" cy="${y}" r="${r}" fill="#6ae0d0" stroke="#17362f" stroke-width="1" vector-effect="non-scaling-stroke"><title>${esc(o.event_date || "Undated occurrence")}</title></circle>`;
            })
            .join("")
        : ""
    }${
      this.focus
        ? (() => {
            const [fx, fy] = this.pixel(this.focus);
            return `<g class="map-focus" pointer-events="none"><circle cx="${fx}" cy="${fy}" r="${this.focusRadius / scale}" fill="#f8ca520a" stroke="#ffe3a0" stroke-dasharray="7 6" vector-effect="non-scaling-stroke"/><circle cx="${fx}" cy="${fy}" r="${r * 6}" fill="#fff4" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${fx}" cy="${fy}" r="${r * 2}" fill="#f8ca52" stroke="#233e36" stroke-width="2" vector-effect="non-scaling-stroke"/></g>`;
          })()
        : ""
    }${p.field
      .map((f) => {
        const color = f.sensitive ? "#d5b4ff" : "#ff9f71";
        if (f.geometry.type === "Point") {
          const [x, y] = this.pixel(f.geometry.coordinates);
          return `<path d="M${x - r * 2},${y}h${r * 4}M${x},${y - r * 2}v${r * 4}" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke"><title>${esc(f.name)}</title></path>`;
        }
        return `<path d="${f.geometry.type === "Polygon" ? this.path(f.geometry) : "M" + f.geometry.coordinates.map((x) => this.pixel(x).join(",")).join("L")}" fill="${f.geometry.type === "Polygon" ? "#ff9f7120" : "none"}" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"><title>${esc(f.name)}</title></path>`;
      })
      .join("")}${
      this.points.length
        ? `<path d="M${this.points.map((x) => this.pixel(x).join(",")).join("L")}" fill="none" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke"/>${this.points
            .map((x, i) => {
              const [a, b] = this.pixel(x);
              return `<circle cx="${a}" cy="${b}" r="${r * 1.5}" fill="#ffda64"><title>Vertex ${i + 1}</title></circle>`;
            })
            .join("")}`
        : ""
    }</svg><div class="map-north">N ↑</div><div class="map-scale">${Math.round(this.box[2] * scale * 0.1).toLocaleString()} m per 10% viewBox width · UTM 11N</div>${this.drawing ? `<div class="draw-tip">Click to add vertices · ${this.points.length} placed · Finish in toolbar</div>` : ""}`;
    this.svg = this.host.querySelector("svg")!;
    const pxPerUnit = this.svg.getScreenCTM()?.a || 1;
    const raw = (90 / pxPerUnit) * scale,
      order = 10 ** Math.floor(Math.log10(raw)),
      distance =
        [1, 2, 5, 10]
          .map((n) => n * order)
          .filter((n) => n <= raw)
          .at(-1) || order;
    const bar = this.host.querySelector(".map-scale")!;
    bar.innerHTML = `<span style="display:inline-block;width:${(distance / scale) * pxPerUnit}px;border-bottom:3px solid currentColor;margin-right:7px"></span>${distance >= 1000 ? distance / 1000 + " km" : distance + " m"} · grid north / UTM 11N`;

    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY > 0 ? 1.2 : 0.83);
      },
      { passive: false },
    );
    this.svg.onpointerdown = (e) => {
      this.moved = false;
      if (!this.drawing) {
        this.pan = { x: e.clientX, y: e.clientY, box: [...this.box] };
        this.svg.setPointerCapture(e.pointerId);
      }
    };
    this.svg.onpointermove = (e) => {
      if (!this.pan) return;
      const dx = e.clientX - this.pan.x,
        dy = e.clientY - this.pan.y;
      if (Math.hypot(dx, dy) > 4) this.moved = true;
      const factor = this.svg.getScreenCTM()?.a || 1;
      this.box = [
        this.pan.box[0] - dx / factor,
        this.pan.box[1] - dy / factor,
        this.pan.box[2],
        this.pan.box[3],
      ];
      this.svg.setAttribute("viewBox", this.box.join(" "));
    };
    this.svg.onpointerup = (e) => {
      const xy = this.geo(this.eventPoint(e));
      this.pan = undefined;
      if (!this.moved) {
        if (this.drawing) this.points.push(xy);
        else this.onPick(xy);
      }
      this.render();
    };
  }
}
