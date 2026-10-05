"""Build the bounded, attributable consulting data pack from existing public assets."""

import csv
import hashlib
import json
from datetime import datetime, timezone

import numpy as np
import rasterio
from PIL import Image
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject
from wildscape.config import ROOT


def build(world="mojave-001"):
    base = ROOT / "public" / "worlds" / world
    manifest = json.loads((base / "manifest.json").read_text())
    meta = manifest["terrain"]
    out = ROOT / "public" / "screening" / world
    out.mkdir(parents=True, exist_ok=True)
    records, excluded = [], {}
    for p in sorted((base / "observations" / "detail").glob("*.json")):
        row = json.loads(p.read_text())
        lic = row.get("license", "").lower()
        if "/licenses/by/" not in lic and "/publicdomain/zero/" not in lic:
            excluded[row.get("license", "unspecified")] = (
                excluded.get(row.get("license", "unspecified"), 0) + 1
            )
            continue
        records.append(row)
    species = json.loads((base / "species" / "index.json").read_text())
    for sp in species:
        sp.pop("media", None)
        sp.pop("conservation", None)
        sp["count"] = sum(r["taxon_id"] == sp["id"] for r in records)
    layers = []
    size = 512
    bounds = meta["grid_bounds"]
    for key, table, title, note in [
        (
            "bps",
            "LF16_BPS.csv",
            "Potential vegetation · BpS 2016",
            "Modeled vegetation under reference disturbance conditions; not current habitat or species occupancy.",
        ),
        (
            "evc",
            "LF2025_EVC.csv",
            "Vegetation cover · EVC 2025",
            "Mapped dominant vegetation cover classes; source nominal resolution 30 m.",
        ),
        (
            "evh",
            "LF2025_EVH.csv",
            "Vegetation height · EVH 2025",
            "Mapped dominant vegetation height classes; not surveyed individual plants.",
        ),
    ]:
        values = np.full((size, size), -9999, dtype=np.int16)
        with rasterio.open(ROOT / "data_raw" / world / f"{key}.tif") as ds:
            reproject(
                rasterio.band(ds, 1),
                values,
                src_crs=ds.crs,
                src_transform=ds.transform,
                src_nodata=ds.nodata,
                dst_crs=meta["crs"],
                dst_transform=from_bounds(*bounds, size, size),
                dst_nodata=-9999,
                resampling=Resampling.nearest,
            )
        with (ROOT / "data_generated" / table).open() as f:
            rows = {int(r["VALUE"]): r for r in csv.DictReader(f)}
        legend = []
        pixels = np.zeros((size, size, 4), dtype=np.uint8)
        for code in sorted(np.unique(values)):
            if code == -9999:
                continue
            row = rows.get(int(code))
            if row is None:
                raise ValueError(f"Unknown {key} code {code}")
            color = [int(float(row[c])) for c in ["R", "G", "B"]]
            pixels[values == code] = color + [220]
            legend.append(
                {
                    "code": int(code),
                    "label": row.get("BPS_NAME", row.get("CLASSNAMES")),
                    "color": "#" + "".join(f"{c:02x}" for c in color),
                }
            )
        Image.fromarray(pixels).save(out / f"{key}.png")
        (out / f"{key}.bin").write_bytes(values.astype("<i2").tobytes())
        layers.append(
            {
                "id": key,
                "title": title,
                "note": note,
                "size": size,
                "bounds": bounds,
                "crs": meta["crs"],
                "cell_m": (bounds[2] - bounds[0]) / size,
                "source_resolution_m": 30,
                "legend": legend,
                "data": f"{key}.bin",
                "image": f"{key}.png",
                "source": "https://www.landfire.gov/",
                "provenance": json.loads(
                    (ROOT / "data_raw" / world / f"{key}.source.json").read_text()
                ),
            }
        )
    pack = {
        "schema": 1,
        "world": world,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "manifest_sha256": hashlib.sha256(
            (base / "manifest.json").read_bytes()
        ).hexdigest(),
        "manifest": manifest,
        "species": species,
        "records": records,
        "excluded_licenses": excluded,
        "layers": layers,
        "notes": [
            "Only CC0 and CC BY occurrence records are included in screening. Other licenses require separate review.",
            "Public coordinates may be generalized. Coordinate uncertainty is retained; zero may mean unreported uncertainty.",
            "Candidate species and mapped habitat are screening context, not confirmed occupancy or an official agency list.",
            "Data are bounded by this regional pack. No records returned does not establish absence.",
        ],
    }
    raw = json.dumps(pack, separators=(",", ":")).encode()
    (out / "pack.json").write_bytes(raw)
    (out / "pack.sha256").write_text(hashlib.sha256(raw).hexdigest() + "\n")
    print(
        f"{len(records)} reusable records; {sum(excluded.values())} excluded by license; {len(layers)} real habitat layers"
    )


if __name__ == "__main__":
    build()
