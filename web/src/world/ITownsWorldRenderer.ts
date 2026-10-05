import * as THREE from "three";
import * as itowns from "itowns";
import { ThreeTerrainRenderer } from "./ThreeTerrainRenderer";

/** Static local rasters enter iTowns through FileSource: no runtime GIS service. */
export class ITownsWorldRenderer extends ThreeTerrainRenderer {
  override readonly name = "iTowns projected terrain";
  private view!: itowns.PlanarView;
  private extent!: itowns.Extent;
  private color?: itowns.ColorLayer;
  private elevation?: itowns.ElevationLayer;
  private serial = 0;
  private shadeTexture?: THREE.DataTexture;
  private pyramid?: itowns.ColorLayer;
  protected override async createEngine() {
    const m = this.data.manifest.terrain;
    const code = Number(m.crs.split(":")[1]);
    const nativeCrs = `${m.crs}:${this.data.manifest.id}`;
    itowns.CRS.defs(
      nativeCrs,
      `+proj=utm +zone=${code % 100} ${code >= 32700 ? "+south " : ""}+datum=WGS84 +units=m +no_defs`,
    );
    const [w, s, e, n] = m.grid_bounds;
    this.extent = new itowns.Extent(nativeCrs, w, e, s, n);
    const viewOptions = { noControls: true, maxSubdivisionLevel: 8 };
    this.view = new itowns.PlanarView(this.element, this.extent, viewOptions);
    this.scene = this.view.scene as THREE.Scene;
    this.renderer = this.view.renderer;
    this.camera = this.view.camera3D as THREE.PerspectiveCamera;
    this.camera.far = 100000;
    this.camera.near = 2;
    this.camera.updateProjectionMatrix();
    this.scene.background = new THREE.Color("#101917");
    this.root.rotation.x = Math.PI / 2;
    this.root.position.set(m.origin[0], m.origin[1], m.origin[2]);
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.view.mainLoop.gfxEngine.label2dRenderer.domElement.style.pointerEvents =
      "none";
    this.nativeTerrain = true;
    this.view.addFrameRequester(itowns.MAIN_LOOP_EVENTS.BEFORE_RENDER, () =>
      this.applyShade(),
    );
  }
  private source(texture: THREE.Texture) {
    // iTowns associates extent metadata with textures; don't set crs on the texture,
    // which would make FileSource treat it as a vector feature collection.
    Object.assign(texture, { extent: this.extent });
    return new itowns.FileSource({
      crs: this.extent.crs,
      extent: this.extent,
      fetchedData: texture,
      parser: async () => texture,
    });
  }
  protected override async installTerrain() {
    // CPU geometry is kept for deterministic picking; iTowns renders tiled elevation.
    this.terrain.visible = false;
    this.root.add(this.terrain);
    await this.updateElevation();
  }
  protected override async updateElevation() {
    if (this.elevation) this.view.removeLayer(this.elevation.id);
    const tex = new THREE.DataTexture(
      this.heights,
      this.gridSize,
      this.gridSize,
      THREE.RedFormat,
      THREE.FloatType,
    );
    tex.needsUpdate = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    const options = {
      source: this.source(tex),
      noDataValue: -9999,
      zmin: this.data.manifest.terrain.elevation_min,
      zmax: this.data.manifest.terrain.elevation_max,
    };
    this.elevation = new itowns.ElevationLayer("dem-" + this.serial++, options);
    await this.view.addLayer(this.elevation);
    this.view.notifyChange();
  }
  private colorTextures = new Set<THREE.Texture>();
  private surfaceColor?: THREE.Texture;
  private normalizedColor(texture: THREE.Texture) {
    // Keep preview and thematic rasters compatible with the imagery tile size
    // when iTowns updates color layers during mode changes.
    const size = this.data.manifest.imagery_pyramid ? 512 : 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d")!;
    if (texture instanceof THREE.DataTexture) {
      const image = texture.image;
      const temporary = document.createElement("canvas");
      temporary.width = image.width;
      temporary.height = image.height;
      temporary
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(image.data as Uint8Array),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      context.drawImage(temporary, 0, 0, size, size);
    } else
      context.drawImage(texture.image as CanvasImageSource, 0, 0, size, size);
    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = texture.colorSpace;
    result.anisotropy = Math.min(
      16,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.colorTextures.add(result);
    return result;
  }
  protected override async updateSurface(texture: THREE.Texture) {
    if (this.color) this.view.removeLayer(this.color.id);
    if (this.surfaceColor) {
      this.surfaceColor.dispose();
      this.colorTextures.delete(this.surfaceColor);
    }
    this.surfaceColor = this.normalizedColor(texture);
    this.color = new itowns.ColorLayer("surface-" + this.serial++, {
      source: this.source(this.surfaceColor),
    });
    await this.view.addLayer(this.color);
    if (this.data.manifest.imagery_pyramid && !this.pyramid) {
      const info = this.data.manifest.imagery_pyramid;
      this.pyramid = new itowns.ColorLayer("naip-detail", {
        source: new itowns.TMSSource({
          url: new URL(
            this.data.base + "terrain/imagery/tiles/${z}/${x}/${y}.webp",
            location.href,
          ).href
            .replaceAll("%7B", "{")
            .replaceAll("%7D", "}"),
          crs: this.extent.crs,
          extent: this.extent,
          format: "image/webp",
          zoom: { min: 0, max: info.max_level },
        }),
      });
      await this.view.addLayer(this.pyramid);
    }
    if (this.pyramid) {
      this.pyramid.visible = this.mode === "WORLD" || this.mode === "AERIAL";
      this.color.visible = !this.pyramid.visible;
      itowns.ColorLayersOrdering.moveLayerToIndex(
        this.view,
        this.pyramid.id,
        1,
      );
    }
    this.view.notifyChange();
  }
  protected override async updateSunSurface(texture?: THREE.DataTexture) {
    this.shadeTexture = texture;
    this.view.notifyChange();
  }
  private applyShade() {
    // Sample the DEM shade independently of iTowns' imagery texture array.
    // This retains native imagery detail and avoids resampling all color layers
    // to the analysis grid's resolution.
    const world = this.extent;
    this.view.tileLayer.object3d.traverse((object: THREE.Object3D) => {
      const tile = object as THREE.Mesh & { extent?: itowns.Extent };
      const material = tile.material as THREE.ShaderMaterial;
      if (!tile.extent || !material?.uniforms) return;
      if (!material.uniforms.wildscapeShadeEnabled) {
        const e = tile.extent;
        material.uniforms.wildscapeShadeEnabled = { value: false };
        material.uniforms.wildscapeShade = { value: null };
        material.uniforms.wildscapeShadeBounds = {
          value: new THREE.Vector4(
            (e.west - world.west) / (world.east - world.west),
            (e.south - world.south) / (world.north - world.south),
            (e.east - e.west) / (world.east - world.west),
            (e.north - e.south) / (world.north - world.south),
          ),
        };
        material.fragmentShader =
          `uniform bool wildscapeShadeEnabled;
          uniform sampler2D wildscapeShade;
          uniform vec4 wildscapeShadeBounds;
        ` +
          material.fragmentShader.replace(
            "#include <fog_fragment>",
            `
          if (wildscapeShadeEnabled) {
            vec2 shadeUV = wildscapeShadeBounds.xy + vUv.xy * wildscapeShadeBounds.zw;
            vec4 shade = texture2D(wildscapeShade, shadeUV);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, shade.rgb, shade.a);
          }
          #include <fog_fragment>`,
          );
        material.needsUpdate = true;
      }
      material.uniforms.wildscapeShadeEnabled.value = !!this.shadeTexture;
      material.uniforms.wildscapeShade.value = this.shadeTexture ?? null;
    });
  }
  protected override redraw() {
    this.root.updateMatrixWorld(true);
    this.view.notifyChange(this.camera, true);
  }
  protected override disposeEngine() {
    this.view?.dispose();
    for (const texture of this.colorTextures) texture.dispose();
    this.colorTextures.clear();
    THREE.Object3D.DEFAULT_UP.set(0, 1, 0);
  }
}
