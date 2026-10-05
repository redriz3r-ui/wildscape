"""Static projected imagery pyramid; acquisitions happen only at build time."""

import io
import json
import concurrent.futures
from pathlib import Path
import httpx
from PIL import Image
from wildscape.biodiversity.adapters.base import request
from wildscape.terrain.remote import NAIP_SERVICE


def fetch_pyramid(meta, destination: Path, max_level=5):
    destination.mkdir(parents=True, exist_ok=True)
    w, s, e, n = meta["grid_bounds"]
    tile_size = 512
    patch_level = max(0, max_level - 2)
    patches = 2**patch_level
    patch_size = tile_size * 2 ** (max_level - patch_level)
    source_dir = destination / "acquisition"
    source_dir.mkdir(exist_ok=True)
    grid = {"bounds": meta["grid_bounds"], "crs": meta["crs"], "max_level": max_level}
    grid_path = source_dir / "grid.json"
    if grid_path.exists() and json.loads(grid_path.read_text()) != grid:
        raise ValueError("Cached NAIP acquisition has different grid bounds or resolution")
    grid_path.write_text(json.dumps(grid, indent=2))

    def acquire(item):
        x, y = item
        bounds = [
            w + (e - w) * x / patches,
            n - (n - s) * (y + 1) / patches,
            w + (e - w) * (x + 1) / patches,
            n - (n - s) * y / patches,
        ]
        target = source_dir / f"{x}-{y}.jpg"
        if not target.exists():
            params = dict(
                f="json",
                bbox=",".join(map(str, bounds)),
                bboxSR=meta["crs"].split(":")[1],
                imageSR=meta["crs"].split(":")[1],
                size=f"{patch_size},{patch_size}",
                format="jpg",
                adjustAspectRatio="false",
                interpolation="RSP_BilinearInterpolation",
            )
            try:
                response = request(NAIP_SERVICE + "/exportImage", params).json()
            except (httpx.HTTPError, ValueError):
                response = {
                    "href": str(httpx.URL(NAIP_SERVICE + "/exportImage", params={**params, "f": "image"})),
                    "extent": dict(zip(("xmin", "ymin", "xmax", "ymax"), bounds)),
                    "direct_response": True,
                }
            if "href" not in response:
                raise ValueError(f"NAIP export failed: {response}")
            returned = response["extent"]
            actual = [returned[k] for k in ("xmin", "ymin", "xmax", "ymax")]
            if max(abs(a - b) for a, b in zip(bounds, actual)) > 0.1:
                raise ValueError("NAIP returned unexpected bounds")
            try:
                payload = request(response["href"]).content
            except (httpx.HTTPError, ValueError):
                payload = request(NAIP_SERVICE + "/exportImage", {**params, "f": "image"}).content
            image = Image.open(io.BytesIO(payload)).convert("RGB")
            if image.size != (patch_size, patch_size):
                raise ValueError("NAIP returned unexpected dimensions")
            target.write_bytes(payload)
            target.with_suffix(".json").write_text(
                json.dumps({"service": NAIP_SERVICE, "request": params, "response": response}, indent=2)
            )
        with Image.open(target) as image:
            factor = 2 ** (max_level - patch_level)
            for dx in range(factor):
                for dy in range(factor):
                    out = destination / str(max_level) / str(x * factor + dx) / f"{y * factor + dy}.webp"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    image.crop((dx * 512, dy * 512, (dx + 1) * 512, (dy + 1) * 512)).save(out, quality=92)
        print(f"NAIP patch {x},{y} ready", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(acquire, [(x, y) for x in range(patches) for y in range(patches)]))
    for level in range(max_level - 1, -1, -1):
        for x in range(2**level):
            for y in range(2**level):
                image = Image.new("RGB", (1024, 1024))
                for dx in range(2):
                    for dy in range(2):
                        with Image.open(
                            destination / str(level + 1) / str(x * 2 + dx) / f"{y * 2 + dy}.webp"
                        ) as child:
                            image.paste(child, (dx * 512, dy * 512))
                out = destination / str(level) / str(x) / f"{y}.webp"
                out.parent.mkdir(parents=True, exist_ok=True)
                image.resize((512, 512), Image.Resampling.LANCZOS).save(out, quality=90)
    info = {
        "crs": meta["crs"],
        "bounds": meta["grid_bounds"],
        "tile_size": 512,
        "max_level": max_level,
        "meters_per_pixel": (e - w) / (512 * 2**max_level),
        "source": NAIP_SERVICE,
        "note": "Export pixel spacing; native imagery resolution and acquisition dates vary.",
    }
    (destination / "metadata.json").write_text(json.dumps(info, indent=2))
    return info
