import json
import hashlib
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling
from rasterio.transform import from_bounds
from PIL import Image, ImageEnhance


def derive(data, meta, out):
    dy, dx = np.gradient(data, meta["height_m"] / (len(data) - 1), meta["width_m"] / (len(data) - 1))
    slope = np.arctan(np.hypot(dx, dy))
    aspect = np.mod(np.arctan2(-dx, dy), 2 * np.pi)
    normals = np.stack([-dx, dy, np.ones_like(dx)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    light = np.array([-0.45, 0.35, 0.82])
    light /= np.linalg.norm(light)
    shade = np.clip((normals @ light) * 0.65 + 0.35, 0, 1)
    for name, array in [
        ("hillshade", (shade * 255).astype("uint8")),
        ("normals", ((normals + 1) * 127.5).astype("uint8")),
    ]:
        (out / name).mkdir(exist_ok=True)
        Image.fromarray(array).save(out / name / "surface.webp", quality=90)
    (out / "slope.bin").write_bytes(np.degrees(slope).astype("<f4").tobytes())
    (out / "aspect.bin").write_bytes(np.degrees(aspect).astype("<f4").tobytes())
    return slope, shade


def prepare_imagery(path, meta, shade, out):
    if not path.exists():
        raise ValueError(f"Imagery missing: {path}; fetch official imagery or use fixture mode")
    n = 1024
    # Texture edges coincide with terrain vertex bounds.
    transform = from_bounds(*meta["grid_bounds"], n, n)
    rgb = np.zeros((3, n, n), dtype="uint8")
    with rasterio.open(path) as ds:
        if ds.crs is None or ds.count < 3:
            raise ValueError("Imagery requires a CRS and at least three RGB bands")
        for band in range(3):
            reproject(
                rasterio.band(ds, band + 1),
                rgb[band],
                src_transform=ds.transform,
                src_crs=ds.crs,
                dst_transform=transform,
                dst_crs=meta["crs"],
                resampling=Resampling.bilinear,
            )
        if (rgb.sum(axis=0) == 0).mean() > 0.05:
            raise ValueError("Imagery does not cover the terrain extent")
    with rasterio.open(path) as source:
        provenance = {
            "source_file": path.name,
            "original_crs": str(source.crs),
            "original_bounds": list(source.bounds),
            "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "tags": source.tags(),
            "output_crs": meta["crs"],
            "output_bounds": meta["grid_bounds"],
            "output_size": n,
            "treatment": "0.78 saturation, 1.05 contrast, mild warm grade, 20% hillshade",
        }
    sidecar = path.with_suffix(".source.json")
    if sidecar.exists():
        acquisition = json.loads(sidecar.read_text())
        provenance["service"] = acquisition.get("service")
        provenance["request"] = acquisition.get("request")
    (out / "imagery-provenance.json").write_text(json.dumps(provenance, indent=2))
    image = Image.fromarray(rgb.transpose(1, 2, 0))
    path_out = out / "imagery"
    path_out.mkdir(exist_ok=True)
    image.save(path_out / "aerial.webp", quality=88)
    graded = ImageEnhance.Color(image).enhance(0.78)
    graded = ImageEnhance.Contrast(graded).enhance(1.05)
    hill = np.asarray(Image.fromarray((shade * 255).astype("uint8")).resize((n, n))) / 255
    arr = np.asarray(graded).astype(float) * (0.80 + 0.20 * hill[..., None]) * np.array([1.035, 1.005, 0.97])
    styled = Image.fromarray(np.clip(arr, 0, 255).astype("uint8"))
    styled.save(path_out / "world.webp", quality=88)
    styled.resize((256, 256)).save(path_out / "low.webp", quality=75)
