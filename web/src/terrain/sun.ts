export interface SunSettings {
  enabled: boolean;
  azimuth: number;
  altitude: number;
  shadows: boolean;
}
export interface SunStats {
  shadowKm2: number;
  shadowPercent: number;
  cellMeters: number;
}
export interface SunGrid {
  heights: Float32Array;
  size: number;
  width: number;
  height: number;
  settings: SunSettings;
}
/** Grid rows run north to south; azimuth is clockwise from grid north. */
export function analyzeSun({
  heights,
  size: n,
  width,
  height,
  settings,
}: SunGrid) {
  const az = (settings.azimuth * Math.PI) / 180,
    alt = (settings.altitude * Math.PI) / 180;
  const sx = Math.sin(az),
    sy = -Math.cos(az),
    up = Math.sin(alt),
    horizontal = Math.cos(alt);
  const dx = width / (n - 1),
    dy = height / (n - 1),
    step = Math.min(dx, dy);
  const bytes = new Uint8Array(n * n * 4);
  let shaded = 0;
  const at = (r: number, c: number) =>
    heights[
      Math.max(0, Math.min(n - 1, r)) * n + Math.max(0, Math.min(n - 1, c))
    ];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const gx =
        (at(r, c + 1) - at(r, c - 1)) / (c === 0 || c === n - 1 ? dx : 2 * dx);
      const gy =
        (at(r + 1, c) - at(r - 1, c)) / (r === 0 || r === n - 1 ? dy : 2 * dy);
      const light = Math.max(
        0,
        (-gx * sx * horizontal - gy * sy * horizontal + up) /
          Math.hypot(gx, gy, 1),
      );
      let shadow = false;
      if (settings.shadows)
        for (let k = 1; k < n * 1.5; k++) {
          const distance = k * step,
            x = c + (sx * distance) / dx,
            y = r + (sy * distance) / dy;
          if (x < 0 || y < 0 || x >= n - 1 || y >= n - 1) break;
          const a = Math.floor(x),
            b = Math.floor(y),
            fx = x - a,
            fy = y - b;
          const terrain =
            (1 - fy) * ((1 - fx) * at(b, a) + fx * at(b, a + 1)) +
            fy * ((1 - fx) * at(b + 1, a) + fx * at(b + 1, a + 1));
          if (terrain > heights[r * n + c] + distance * Math.tan(alt) + 0.5) {
            shadow = true;
            break;
          }
        }
      if (shadow) shaded++;
      // Ambient fill preserves imagery; cast shade has an additional blue-gray tint.
      bytes.set(
        [
          shadow ? 15 : 0,
          shadow ? 22 : 0,
          shadow ? 30 : 0,
          Math.round(255 * (shadow ? 0.64 : 0.44 * (1 - light))),
        ],
        (r * n + c) * 4,
      );
    }
  return {
    bytes,
    stats: {
      shadowKm2: ((shaded / (n * n)) * width * height) / 1e6,
      shadowPercent: (shaded / (n * n)) * 100,
      cellMeters: step,
    },
  };
}
