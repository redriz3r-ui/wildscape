from pathlib import Path
import json
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
import yaml
from PIL import Image
from wildscape.config import source_path
from wildscape.terrain.dem import sample


def raster_layer(path, meta):
    n = meta["size"]
    out = np.full((n, n), np.nan, dtype="float32")
    with rasterio.open(path) as ds:
        if not ds.crs:
            raise ValueError(f"LANDFIRE raster has no CRS: {path}")
        reproject(
            rasterio.band(ds, 1),
            out,
            src_transform=ds.transform,
            src_crs=ds.crs,
            src_nodata=ds.nodata,
            dst_transform=from_bounds(*meta["raster_bounds"], n, n),
            dst_crs=meta["crs"],
            dst_nodata=np.nan,
            resampling=Resampling.nearest,
        )
        provenance = {"path": path.name, "crs": str(ds.crs), "tags": ds.tags(), "nodata": ds.nodata}
    return out, provenance


def decode(data, mapping, name):
    if not mapping:
        raise ValueError(f"Real LANDFIRE {name} needs a release-specific code-to-value mapping in world.yaml")
    out = np.full(data.shape, np.nan)
    for key, value in mapping.items():
        out[data == float(key)] = float(value)
    if np.isnan(out[np.isfinite(data)]).any():
        raise ValueError(f"Unmapped {name} codes; update the release-specific mapping")
    return out


def build_vegetation(c, data, meta, slope, out):
    paths = {name: source_path(c, name) for name in ("bps", "evt", "evc", "evh")}
    missing = [name for name, path in paths.items() if not path.exists()]
    out.mkdir(parents=True, exist_ok=True)
    if missing:
        warning = "LANDFIRE unavailable: " + ", ".join(missing) + "; 3D vegetation omitted"
        (out / "placement.json").write_text("[]")
        (out / "metadata.json").write_text(json.dumps({"warning": warning, "models": {}, "sources": []}))
        return warning
    layers = {}
    sources = []
    for name, path in paths.items():
        layers[name], provenance = raster_layer(path, meta)
        sources.append({"layer": name, **provenance})
    v = c.get("vegetation", {})
    cover = layers["evc"] if c.get("fixture") else decode(layers["evc"], v.get("evc_mapping"), "EVC")
    height = layers["evh"] if c.get("fixture") else decode(layers["evh"], v.get("evh_mapping"), "EVH")
    bps_values = [10820] if c.get("fixture") else v.get("bps_values", [])
    if not bps_values:
        raise ValueError("Set vegetation.bps_values from the LANDFIRE release attribute table")
    ecosystem = Path(c["_path"]).with_name("ecosystem.yaml")
    if not ecosystem.exists():
        raise ValueError("Provide ecosystem.yaml model weights for this world")
    models = yaml.safe_load(ecosystem.read_text())["models"]
    rng = np.random.default_rng(v.get("seed", 10820))
    items = []
    names = list(models)
    default_weights = np.array([models[k]["weight"] for k in names])
    default_weights /= default_weights.sum()
    n = meta["size"]
    w, s, e, t = meta["grid_bounds"]
    ox, on, oz = meta["origin"]
    for _ in range(int(v.get("max_instances", 14000)) * 5):
        u, vv = rng.random(2)
        row = int(vv * (n - 1))
        col = int(u * (n - 1))
        if not np.isfinite(height[row, col]) or not np.isin(layers["bps"][row, col], bps_values):
            continue
        if rng.random() > max(0, min(1, cover[row, col] / 100)) or slope[row, col] > 0.75:
            continue
        weights = default_weights
        overrides = v.get("evt_weights", {}).get(int(layers["evt"][row, col]))
        if overrides:
            weights = np.array([overrides.get(k, 0) for k in names], dtype=float)
            weights /= weights.sum()
        kind = str(rng.choice(names, p=weights))
        # Trees are deliberately rare; heights and cover influence visualization, not plant claims.
        scale = (
            float(models[kind]["scale"])
            * float(rng.uniform(0.7, 1.4))
            * max(0.5, min(2, float(height[row, col])))
        )
        items.append(
            [
                kind,
                round(w + u * (e - w) - ox, 2),
                round(sample(data, meta, w + u * (e - w), t - vv * (t - s)) - oz, 2),
                round(on - (t - vv * (t - s)), 2),
                round(scale, 2),
                round(float(rng.uniform(0, 6.283)), 3),
            ]
        )
        if len(items) >= c.get("vegetation", {}).get("max_instances", 14000):
            break
    colors = np.stack([100 + cover * 1.3, 110 + cover * 1.8, 66 + cover * 0.7], axis=-1)
    image = Image.fromarray(np.nan_to_num(np.clip(colors, 0, 255), nan=70).astype("uint8"))
    image.save(out / "cover.webp", quality=88)
    (out / "placement.json").write_text(json.dumps(items, separators=(",", ":")))
    (out / "metadata.json").write_text(
        json.dumps(
            {
                "models": models,
                "sources": sources,
                "instances": len(items),
                "note": "Data-informed visualization; not mapped individual plants.",
                "evc_units": "percent cover",
                "evh_units": "meters",
                "fixture": bool(c.get("fixture")),
            },
            indent=2,
        )
    )
    return None
