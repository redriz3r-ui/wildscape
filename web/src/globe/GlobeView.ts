import type { MeshPhongMaterial } from "three";
import Globe from "globe.gl";
import type { WorldSummary } from "../data/types";
import { json } from "../data/load";
export async function mountGlobe(
  element: HTMLDivElement,
  worlds: WorldSummary[],
  select: (w: WorldSummary) => void,
) {
  const globe = new Globe(element, {
    animateIn: false,
    rendererConfig: { antialias: true, alpha: true },
  })
    .backgroundColor("#101917")
    .showAtmosphere(true)
    .atmosphereColor("#567567")
    .atmosphereAltitude(0.13)
    .globeImageUrl("/earth.webp")
    .showGraticules(false)
    .pointsData(
      worlds.map((w) => ({
        ...w,
        lat: (w.bbox[1] + w.bbox[3]) / 2,
        lng: (w.bbox[0] + w.bbox[2]) / 2,
      })),
    )
    .pointAltitude(0.025)
    .pointRadius(0.6)
    .pointColor(() => "#e6dfac")
    .pointLabel(
      (d) =>
        `${(d as WorldSummary).name} · ${(d as WorldSummary).fixture ? "Fixture world" : "Explore"}`,
    )
    .onPointClick((d) => select(d as WorldSummary));
  const material = globe.globeMaterial() as MeshPhongMaterial;
  material.color.set("#bacbbd");
  material.shininess = 2;
  globe.pointOfView({ lat: 28, lng: -111, altitude: 2.05 }, 0);
  globe.controls().autoRotate = !matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  globe.controls().autoRotateSpeed = 0.25;
  const resize = new ResizeObserver(() =>
    globe.width(element.clientWidth).height(element.clientHeight),
  );
  resize.observe(element);
  // Offline land geometry is bundled; no data provider is contacted by the deployed browser.
  void json<{ features: object[] }>("/earth-land.geojson")
    .then((data) =>
      globe
        .polygonsData(data.features)
        .polygonCapColor(() => "#596b59")
        .polygonSideColor(() => "#34463d")
        .polygonStrokeColor(() => "#8c9a77")
        .polygonAltitude(0.001),
    )
    .catch(() => {});
  return {
    async focus(w: WorldSummary) {
      globe.controls().autoRotate = false;
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 1000;
      globe.pointOfView(
        {
          lat: (w.bbox[1] + w.bbox[3]) / 2,
          lng: (w.bbox[0] + w.bbox[2]) / 2,
          altitude: 0.45,
        },
        duration,
      );
      await new Promise((r) => setTimeout(r, duration));
    },
    dispose() {
      resize.disconnect();
      globe.pauseAnimation();
      globe._destructor();
      element.replaceChildren();
    },
  };
}
