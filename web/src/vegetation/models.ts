import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Placement, VegetationMeta } from "../data/types";
function geometry(kind: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const sphere = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    parts.push(g);
  };
  const stem = (x: number, y: number, z: number, h: number, r: number) => {
    const g = new THREE.CylinderGeometry(r * 0.6, r, h, 5);
    g.translate(x, y + h / 2, z);
    parts.push(g);
  };
  if (kind === "rock") sphere(0, 0.4, 0, 1, 0.7, 0.8);
  else if (kind === "cactus") {
    sphere(0, 0.5, 0, 0.3, 0.7, 0.12);
    sphere(0.4, 1, 0, 0.3, 0.5, 0.1);
    sphere(-0.25, 0.9, 0.04, 0.24, 0.35, 0.12);
  } else if (kind === "joshua") {
    stem(0, 0, 0, 0.65, 0.1);
    sphere(0, 0.85, 0, 0.32, 0.28, 0.32);
    stem(0.3, 0.4, 0, 0.35, 0.06);
    sphere(0.3, 0.8, 0, 0.26, 0.25, 0.25);
    sphere(-0.25, 0.7, 0, 0.25, 0.2, 0.2);
  } else if (kind === "yucca" || kind === "grass" || kind === "ephedra") {
    const count = kind === "yucca" ? 11 : 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const g = new THREE.ConeGeometry(
        kind === "ephedra" ? 0.025 : 0.055,
        kind === "grass" ? 0.8 : 1.2,
        3,
      );
      g.rotateZ(0.5);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.15, 0.4, Math.sin(a) * 0.15);
      parts.push(g);
    }
  } else {
    sphere(0, 0.4, 0, 0.6, 0.5, 0.55);
    sphere(0.35, 0.25, 0.13, 0.45, 0.3, 0.4);
    sphere(-0.3, 0.25, -0.2, 0.4, 0.35, 0.4);
  }
  return mergeGeometries(
    parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  );
}
export function vegetationGroup(rows: Placement[], meta: VegetationMeta) {
  const group = new THREE.Group();
  const matrix = new THREE.Matrix4(),
    p = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    s = new THREE.Vector3();
  for (const kind of Object.keys(meta.models)) {
    const subset = rows.filter((r) => r[0] === kind);
    if (!subset.length) continue;
    const mesh = new THREE.InstancedMesh(
      geometry(kind),
      new THREE.MeshStandardMaterial({
        color: meta.models[kind].color,
        roughness: 1,
      }),
      subset.length,
    );
    subset.forEach((r, i) => {
      p.set(r[1], r[2], r[3]);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r[5]);
      s.setScalar(r[4]);
      matrix.compose(p, q, s);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.kind = kind;
    group.add(mesh);
  }
  return group;
}
