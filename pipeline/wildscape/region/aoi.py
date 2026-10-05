import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from rasterio.windows import Window, bounds
from pyproj import CRS


def local_crs(bbox: list[float]) -> str:
    lon = (bbox[0] + bbox[2]) / 2
    lat = (bbox[1] + bbox[3]) / 2
    return f"EPSG:{(32600 if lat >= 0 else 32700) + min(60, int((lon + 180) // 6) + 1)}"


def find_candidates(path, values: list[int], size_km: float, minimum: float = 0.6) -> list[dict]:
    """Values are raster VALUE codes from the release RAT, not BPS_CODE by assumption."""
    with rasterio.open(path) as ds:
        if not ds.crs or not CRS(ds.crs).is_projected or CRS(ds.crs).axis_info[0].unit_name != "metre":
            raise ValueError("AOI discovery requires a projected LANDFIRE raster in meters")
        nx = max(1, round(size_km * 1000 / abs(ds.res[0])))
        ny = max(1, round(size_km * 1000 / abs(ds.res[1])))
        candidates = []
        for row in range(0, ds.height - ny + 1, max(1, ny // 2)):
            for col in range(0, ds.width - nx + 1, max(1, nx // 2)):
                win = Window(col, row, nx, ny)
                data = ds.read(1, window=win, out_shape=(64, 64), masked=True)
                coverage = float(np.isin(data.filled(-9999), values).sum() / data.size)
                if coverage >= minimum:
                    b = transform_bounds(ds.crs, "EPSG:4326", *bounds(win, ds.transform))
                    candidates.append(
                        {
                            "bbox": list(b),
                            "bps_coverage": coverage,
                            "source": str(path),
                            "relief": "review DEM before verification",
                        }
                    )
        return sorted(candidates, key=lambda x: -x["bps_coverage"])[:20]
