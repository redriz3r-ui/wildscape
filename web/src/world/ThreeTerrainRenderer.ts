import type { SunSettings, SunStats } from "../terrain/sun";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { LocalWorldRenderer, RendererEvents } from "./LocalWorldRenderer";
import type { WorldData, Observation, Mode } from "../data/types";
import { Coordinates } from "../terrain/coordinates";
import { floats } from "../data/load";
import { aggregate, type Marker } from "../wildlife/spatial";
import { vegetationGroup } from "../vegetation/models";

export class ThreeTerrainRenderer implements LocalWorldRenderer {
  readonly name: string = "Three.js static terrain";
  protected scene!: THREE.Scene;
  protected camera!: THREE.PerspectiveCamera;
  protected renderer!: THREE.WebGLRenderer;
  protected root = new THREE.Group();
  protected controls!: OrbitControls;
  protected element!: HTMLDivElement;
  protected data!: WorldData;
  protected events!: RendererEvents;
  protected coords!: Coordinates;
  protected heights!: Float32Array;
  protected gridSize = 0;
  protected terrain!: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;
  protected nativeTerrain = false;
  protected mode: Mode = "WORLD";
  protected textures = new Map<string, THREE.Texture>();
  private sunLight = new THREE.DirectionalLight("#fff1d4", 2.6);
  private sunWorker?: Worker;
  private finishSun?: (value: SunStats | undefined) => void;
  protected sunSettings: SunSettings = {
    enabled: false,
    azimuth: 315,
    altitude: 35,
    shadows: true,
  };
  protected sunTexture?: THREE.DataTexture;
  private vegetation!: THREE.Group;
  private points!: THREE.Points;
  private pointGeometry = new THREE.BufferGeometry();
  private markers: Marker[] = [];
  private records: Observation[] = [];
  private selected: string | null = null;
  private resolution: number | null | undefined = undefined;
  private frame = 0;
  private abort = new AbortController();
  private disposed = false;
  private resize!: ResizeObserver;
  private down = [0, 0];
  private tween: {
    start: number;
    duration: number;
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromTarget: THREE.Vector3;
    target: THREE.Vector3;
    resolve: () => void;
  } | null = null;
  protected async createEngine() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#101917");
    this.camera = new THREE.PerspectiveCamera(42, 1, 2, 100000);
    this.camera.up.set(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.element.append(this.renderer.domElement);
    this.scene.add(this.root);
  }
  protected redraw() {
    this.renderer.render(this.scene, this.camera);
  }
  protected disposeEngine() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
  protected async installTerrain() {
    this.root.add(this.terrain);
  }
  protected async updateSurface(texture: THREE.Texture) {
    this.terrain.material.map = texture;
    this.terrain.material.needsUpdate = true;
  }
  protected async updateElevation() {
    /* Static Three mesh is replaced by rebuildTerrain. */
  }
  protected native(local: THREE.Vector3) {
    return this.root.localToWorld(local.clone());
  }
  protected local(native: THREE.Vector3) {
    return this.root.worldToLocal(native.clone());
  }
  async mount(
    element: HTMLDivElement,
    data: WorldData,
    events: RendererEvents,
  ) {
    this.element = element;
    this.data = data;
    this.events = events;
    this.coords = new Coordinates(data.manifest.terrain);
    this.heights = data.elevation;
    this.gridSize = data.manifest.terrain.low_size;
    this.records = data.observations;
    await this.createEngine();
    this.root.updateMatrixWorld(true);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.FogExp2("#29332e", 0.000018);
    this.scene.add(new THREE.HemisphereLight("#efe9d6", "#736954", 2));
    const sun = this.sunLight;
    sun.position.copy(this.native(new THREE.Vector3(-6000, 11000, 5000)));
    this.scene.add(sun);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 80;
    this.controls.maxDistance = data.manifest.terrain.width_m * 2.7;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.target.copy(this.native(new THREE.Vector3(0, 450, 0)));
    this.controls.addEventListener("start", () => {
      this.tween?.resolve();
      this.tween = null;
    });
    this.rebuildTerrain();
    await this.installTerrain();
    this.vegetation = vegetationGroup(data.placements, data.vegetation);
    this.root.add(this.vegetation);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexColors: true,
      vertexShader:
        "#include <common>\n#include <logdepthbuf_pars_vertex>\nattribute float pointSize; varying vec3 vColor; void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=pointSize;gl_Position=projectionMatrix*mv;\n#include <logdepthbuf_vertex>\n}",
      fragmentShader:
        "#include <logdepthbuf_pars_fragment>\nvarying vec3 vColor; void main(){\n#include <logdepthbuf_fragment>\nfloat d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.15,d);gl_FragColor=vec4(vColor,a*.92);}",
    });
    this.points = new THREE.Points(this.pointGeometry, material);
    this.points.renderOrder = 10;
    this.root.add(this.points);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D landscape. Drag to orbit, scroll to zoom, click terrain to find records.",
    );
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.renderer.domElement.addEventListener("pointerup", this.pointerUp);
    this.resize = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(element);
    await this.home(false);
    const preview = await new THREE.TextureLoader().loadAsync(
      data.base + data.manifest.assets.imagery_low,
    );
    preview.colorSpace = THREE.SRGBColorSpace;
    this.textures.set("PREVIEW", preview);
    await this.updateSurface(preview);
    this.animate();
    // A small mesh/texture is visible first; higher resolution is fetched only after mounting.
    void this.upgrade().catch((e) => {
      if (!this.disposed)
        events.onStatus(`Using preview resolution: ${String(e)}`);
    });
  }
  private async upgrade() {
    const data = await floats(
      this.data.base + this.data.manifest.assets.elevation_high,
      this.abort.signal,
    );
    if (this.disposed) return;
    this.heights = data;
    this.gridSize = this.data.manifest.terrain.size;
    this.rebuildTerrain();
    await this.updateElevation();
    this.resolution = undefined;
    if (this.sunSettings.enabled) void this.setSun(this.sunSettings);
    const texture = await this.texture("WORLD");
    if (!this.disposed && this.mode === "WORLD")
      await this.updateSurface(texture);
  }
  protected rebuildTerrain() {
    const m = this.data.manifest.terrain,
      n = this.gridSize,
      g = new THREE.PlaneGeometry(m.width_m, m.height_m, n - 1, n - 1);
    g.rotateX(-Math.PI / 2);
    const positions = g.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      positions.setY(i, this.heights[i] - m.origin[2]);
    g.computeVertexNormals();
    if (this.terrain) {
      this.terrain.geometry.dispose();
      this.terrain.geometry = g;
    } else
      this.terrain = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({
          roughness: 1,
          metalness: 0,
          color: "#e9e4d7",
          side: THREE.DoubleSide,
        }),
      );
    this.terrain.name = "dem-terrain";
  }
  protected async texture(mode: Mode) {
    if (this.textures.has(mode)) return this.textures.get(mode)!;
    let texture: THREE.Texture;
    if (mode === "ELEVATION") {
      const n = this.gridSize,
        bytes = new Uint8Array(n * n * 4),
        min = this.data.manifest.terrain.elevation_min,
        range = this.data.manifest.terrain.elevation_max - min;
      const stops = ["#344b49", "#718171", "#b9b08a", "#c5a27a", "#eee2c9"].map(
        (c) => new THREE.Color(c),
      );
      for (let i = 0; i < n * n; i++) {
        const t =
            THREE.MathUtils.clamp((this.heights[i] - min) / range, 0, 0.999) *
            4,
          j = Math.floor(t);
        const color = stops[j].clone().lerp(stops[j + 1], t - j);
        bytes.set([color.r * 255, color.g * 255, color.b * 255, 255], i * 4);
      }
      texture = new THREE.DataTexture(bytes, n, n);
      texture.flipY = true;
      texture.needsUpdate = true;
    } else {
      const path =
        mode === "AERIAL"
          ? this.data.manifest.assets.imagery_aerial
          : mode === "VEGETATION" && !this.data.vegetation.warning
            ? "vegetation/cover.webp"
            : this.data.manifest.assets.imagery_world;
      texture = await new THREE.TextureLoader().loadAsync(
        this.data.base + path,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.textures.set(mode, texture);
    return texture;
  }
  protected async updateSunSurface(_texture?: THREE.DataTexture) {
    // The default renderer uses actual directional lighting on its mesh.
    this.terrain.material.needsUpdate = true;
  }
  async setSun(settings: SunSettings): Promise<SunStats | undefined> {
    this.sunSettings = { ...settings };
    this.sunWorker?.terminate();
    this.finishSun?.(undefined);
    const az = (settings.azimuth * Math.PI) / 180,
      alt = (settings.altitude * Math.PI) / 180;
    const center = new THREE.Vector3(0, 0, 0);
    this.sunLight.target.position.copy(this.native(center));
    this.scene.add(this.sunLight.target);
    this.sunLight.position.copy(
      this.native(
        new THREE.Vector3(
          Math.sin(az) * Math.cos(alt),
          Math.sin(alt),
          -Math.cos(az) * Math.cos(alt),
        ).multiplyScalar(20000),
      ),
    );
    this.sunLight.updateMatrixWorld(true);
    this.sunLight.target.updateMatrixWorld(true);
    if (!settings.enabled) {
      await this.updateSunSurface();
      return undefined;
    }
    const size = Math.min(257, this.gridSize),
      heights = new Float32Array(size * size);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        heights[r * size + c] =
          this.heights[
            Math.round((r * (this.gridSize - 1)) / (size - 1)) * this.gridSize +
              Math.round((c * (this.gridSize - 1)) / (size - 1))
          ];
    const worker = new Worker(
      new URL("../terrain/sun.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.sunWorker = worker;
    return new Promise((resolve) => {
      this.finishSun = resolve;
      worker.onmessage = async (
        event: MessageEvent<{ bytes: Uint8Array; stats: SunStats }>,
      ) => {
        if (this.disposed || this.sunWorker !== worker) return;
        const texture = new THREE.DataTexture(
          event.data.bytes,
          size,
          size,
          THREE.RGBAFormat,
        );
        texture.flipY = true;
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const previous = this.sunTexture;
        this.sunTexture = texture;
        await this.updateSunSurface(texture);
        previous?.dispose();
        worker.terminate();
        resolve(event.data.stats);
      };
      worker.onerror = () => {
        this.events.onStatus("Sun analysis could not finish.");
        resolve(undefined);
      };
      worker.postMessage(
        {
          heights,
          size,
          width: this.data.manifest.terrain.width_m,
          height: this.data.manifest.terrain.height_m,
          settings,
        },
        [heights.buffer],
      );
    });
  }
  async setMode(mode: Mode) {
    this.mode = mode;
    const texture = await this.texture(mode);
    if (this.disposed) return;
    await this.updateSurface(texture);
    this.terrain.material.color.set(mode === "SPECIES" ? "#697771" : "#e9e4d7");
    this.vegetation.visible = mode === "WORLD";
    this.resolution = undefined;
  }
  setRecords(records: Observation[], selected: string | null) {
    this.records = records;
    this.selected = selected;
    this.resolution = undefined;
  }
  private updateMarkers() {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const res = this.selected
      ? null
      : distance > 15000
        ? 5
        : distance > 5500
          ? 7
          : null;
    if (res === this.resolution) return;
    this.resolution = res;
    this.markers = aggregate(this.records, res);
    const p: number[] = [],
      colors: number[] = [],
      sizes: number[] = [];
    for (const marker of this.markers) {
      const [x, , z] = this.coords.toScene(marker.longitude, marker.latitude);
      const y = this.coords.sample(this.heights, this.gridSize, x, z);
      p.push(x, (y ?? 60) + 45, z);
      const historical = marker.records.every(
        (r) =>
          r.is_historical ||
          ["PRESERVED_SPECIMEN", "FOSSIL_SPECIMEN"].includes(r.basis_of_record),
      );
      const color = new THREE.Color(
        historical
          ? "#d6a879"
          : marker.records.some((r) => r.is_sensitive)
            ? "#c8b7e2"
            : "#dceabc",
      );
      colors.push(color.r, color.g, color.b);
      sizes.push(
        Math.min(26, marker.count > 1 ? 12 + Math.log2(marker.count) * 2 : 11),
      );
    }
    this.pointGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(p, 3),
    );
    this.pointGeometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3),
    );
    this.pointGeometry.setAttribute(
      "pointSize",
      new THREE.Float32BufferAttribute(sizes, 1),
    );
    this.pointGeometry.computeBoundingSphere();
    this.events.onScale(
      res === null
        ? "Individual records"
        : res === 7
          ? "Local clusters"
          : "Regional clusters",
    );
  }
  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    if (this.tween) {
      const t = this.tween;
      let k = Math.min(1, (performance.now() - t.start) / t.duration);
      k = k * k * (3 - 2 * k);
      this.camera.position.lerpVectors(t.from, t.to, k);
      this.controls.target.lerpVectors(t.fromTarget, t.target, k);
      if (k >= 1) {
        t.resolve();
        this.tween = null;
      }
    }
    this.controls.update();
    // Enforce clearance using the same DEM sampler as markers and queries.
    const p = this.local(this.camera.position),
      ground = this.coords.sample(this.heights, this.gridSize, p.x, p.z);
    if (ground !== null && p.y < ground + 45) {
      p.y = ground + 45;
      this.camera.position.copy(this.native(p));
    }
    this.updateMarkers();
    const range = this.camera.position.distanceTo(this.controls.target);
    this.vegetation.visible = this.mode === "WORLD" && range < 11000;
    for (const obj of this.vegetation.children)
      obj.visible =
        range < 4500 ||
        ["blackbrush", "yucca", "joshua", "ephedra"].includes(
          obj.userData.kind as string,
        );
    this.redraw();
  };
  private pointerDown = (event: PointerEvent) => {
    this.down = [event.clientX, event.clientY];
  };
  private pointerUp = (event: PointerEvent) => {
    if (
      Math.hypot(event.clientX - this.down[0], event.clientY - this.down[1]) >
        5 ||
      event.button !== 0
    )
      return;
    const rect = this.renderer.domElement.getBoundingClientRect(),
      sx = event.clientX - rect.left,
      sy = event.clientY - rect.top;
    const positions = this.pointGeometry.getAttribute("position");
    let best = -1,
      bestDistance = 18;
    for (let i = 0; i < this.markers.length; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i);
      this.root.localToWorld(p);
      p.project(this.camera);
      if (p.z > 1 || p.z < -1) continue;
      const d = Math.hypot(
        ((p.x + 1) / 2) * rect.width - sx,
        ((-p.y + 1) / 2) * rect.height - sy,
      );
      if (d < bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    if (best >= 0) {
      const marker = this.markers[best];
      if (marker.count === 1) this.events.onOccurrence(marker.records[0]);
      else void this.fit(marker.records);
      return;
    }
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((sx / rect.width) * 2 - 1, 1 - (sy / rect.height) * 2),
      this.camera,
    );
    this.terrain.updateMatrixWorld(true);
    const hit = ray.intersectObject(this.terrain)[0];
    if (hit) {
      const p = this.local(hit.point),
        [lon, lat] = this.coords.toGeo(p.x, p.y, p.z);
      this.events.onLocation(lon, lat);
    }
  };
  queryCenter() {
    const p = this.local(this.controls.target);
    const [lon, lat] = this.coords.toGeo(p.x, p.y, p.z);
    this.events.onLocation(lon, lat);
  }
  private move(
    target: THREE.Vector3,
    range: number,
    duration = 1200,
  ): Promise<void> {
    this.tween?.resolve();
    const next = this.native(target),
      camera = this.native(
        target
          .clone()
          .add(new THREE.Vector3(range * 0.4, range * 0.65, range * 0.8)),
      );
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) duration = 1;
    return new Promise((resolve) => {
      this.tween = {
        start: performance.now(),
        duration,
        from: this.camera.position.clone(),
        to: camera,
        fromTarget: this.controls.target.clone(),
        target: next,
        resolve,
      };
    });
  }
  async home(animate = true) {
    const m = this.data.manifest.terrain,
      target = new THREE.Vector3(
        0,
        (m.elevation_min + m.elevation_max) / 2 - m.origin[2],
        0,
      ),
      range = m.width_m * 0.88;
    if (animate) return this.move(target, range);
    this.controls.target.copy(this.native(target));
    this.camera.position.copy(
      this.native(
        target
          .clone()
          .add(new THREE.Vector3(range * 0.4, range * 0.65, range * 0.8)),
      ),
    );
    this.controls.update();
  }
  async flyTo(r: Observation) {
    const [x, , z] = this.coords.toScene(r.longitude, r.latitude);
    const ground = this.coords.sample(this.heights, this.gridSize, x, z);
    return this.move(
      new THREE.Vector3(x, ground ?? 100, z),
      r.is_sensitive ? Math.max(4500, r.uncertainty_m) : 1200,
    );
  }
  async fit(records: Observation[]) {
    const rows = records.filter((r) => !r.outside_terrain);
    if (!rows.length) return this.home();
    const box = new THREE.Box3();
    for (const r of rows) {
      const [x, , z] = this.coords.toScene(r.longitude, r.latitude);
      box.expandByPoint(
        new THREE.Vector3(
          x,
          this.coords.sample(this.heights, this.gridSize, x, z) ?? 100,
          z,
        ),
      );
    }
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    return this.move(center, Math.max(size.x, size.z, 1400) * 1.1);
  }
  zoom(factor: number) {
    const offset = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(factor);
    this.camera.position.copy(this.controls.target).add(offset);
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.sunWorker?.terminate();
    this.finishSun?.(undefined);
    this.sunTexture?.dispose();
    cancelAnimationFrame(this.frame);
    this.tween?.resolve();
    this.controls?.dispose();
    this.resize?.disconnect();
    this.renderer?.domElement.removeEventListener(
      "pointerdown",
      this.pointerDown,
    );
    this.renderer?.domElement.removeEventListener("pointerup", this.pointerUp);
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    for (const texture of this.textures.values()) texture.dispose();
    this.disposeEngine();
    this.element.replaceChildren();
  }
}
