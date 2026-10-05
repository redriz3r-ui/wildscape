import json
from pathlib import Path

import rasterio
import yaml
from wildscape.config import ROOT, load_world, source_path
from wildscape.terrain.dem import prepare_dem
from wildscape.terrain.pyramid import fetch_pyramid
from wildscape.terrain.remote import DEM_SERVICE, export_image

c = load_world("mojave-001")
w, s, e, n = c["aoi"]["bbox"]
# More source samples before increasing output detail.
with rasterio.open(source_path(c, "dem")) as source:
    needs_dem = source.width < 2048
if needs_dem:
    export_image(
        DEM_SERVICE,
        [w - 0.025, s - 0.025, e + 0.025, n + 0.025],
        source_path(c, "dem"),
        2048,
        True,
    )
p = Path(c["_path"])
config = yaml.safe_load(p.read_text())
config["terrain"]["resolution"] = 1025
p.write_text(yaml.safe_dump(config, sort_keys=False))
out = ROOT / "data_generated" / "mojave-001" / "detail-terrain"
out.mkdir(parents=True, exist_ok=True)
_, meta = prepare_dem(source_path(c, "dem"), c["aoi"]["bbox"], out, 1025)
folder = ROOT / "data_generated" / "mojave-001" / "imagery-pyramid"
if (folder / "metadata.json").exists():
    old = json.loads((folder / "metadata.json").read_text())
    if old["bounds"] != meta["grid_bounds"]:
        raise ValueError("Pyramid extent changed; use a fresh acquisition folder")
fetch_pyramid(meta, folder)
print("Detailed DEM and imagery pyramid ready")
