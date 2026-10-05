import json
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.transform import from_bounds
from pyproj import Transformer
from wildscape.region.aoi import local_crs


def inspect_dem(path) -> dict:
    with rasterio.open(path) as ds:
        if ds.crs is None:
            raise ValueError("DEM has no CRS")
        if ds.width < 2 or ds.height < 2 or not np.isfinite(ds.bounds).all():
            raise ValueError("DEM has invalid dimensions/bounds")
        data = ds.read(1, masked=True, out_shape=(min(ds.height, 1024), min(ds.width, 1024)))
        if data.count() == 0 or not np.isfinite(data.compressed()).all():
            raise ValueError("DEM contains no usable finite elevations")
        return {
            "original_crs": ds.crs.to_string(),
            "original_bounds": list(ds.bounds),
            "geographic_footprint": list(transform_bounds(ds.crs, "EPSG:4326", *ds.bounds)),
            "source_nodata": ds.nodata if ds.nodata is None or np.isfinite(ds.nodata) else None,
            "source_nodata_repr": str(ds.nodata),
            "source_shape": [ds.height, ds.width],
        }


def prepare_dem(path, bbox, out, resolution=129) -> tuple[np.ndarray, dict]:
    provenance = inspect_dem(path)
    crs = local_crs(bbox)
    west, south, east, north = transform_bounds("EPSG:4326", crs, *bbox, densify_pts=21)
    n = int(resolution)
    if n < 17 or n > 1025:
        raise ValueError("Terrain resolution must be 17–1025")
    tr = from_bounds(west, south, east, north, n, n)
    data = np.full((n, n), np.nan, dtype="float32")
    with rasterio.open(path) as ds:
        reproject(
            rasterio.band(ds, 1),
            data,
            src_transform=ds.transform,
            src_crs=ds.crs,
            src_nodata=ds.nodata,
            dst_transform=tr,
            dst_crs=crs,
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    if not np.isfinite(data).all():
        raise ValueError(
            "DEM has NoData within the requested rectangular extent; provide coverage plus margin"
        )
    # Vertices represent pixel CENTERS, avoiding a half-cell imagery/height offset.
    grid = [west + tr.a / 2, south - tr.e / 2, east - tr.a / 2, north + tr.e / 2]
    origin = [(west + east) / 2, (south + north) / 2, float(np.floor(data.min() / 100) * 100)]
    meta = {
        **provenance,
        "crs": crs,
        "bbox": bbox,
        "grid_bounds": grid,
        "raster_bounds": [west, south, east, north],
        "size": n,
        "origin": origin,
        "elevation_min": float(data.min()),
        "elevation_max": float(data.max()),
        "width_m": grid[2] - grid[0],
        "height_m": grid[3] - grid[1],
        "vertical_units": "meters",
        "vertical_datum": "source datum; no vertical datum conversion",
        "axes": "X=easting-originX; Y=elevation-originY; Z=originNorthing-northing",
        "encoding": "little-endian float32 row-major north to south",
        "source": str(path.name),
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "elevation").mkdir(exist_ok=True)
    data.astype("<f4").tofile(out / "elevation" / "high.bin")
    low_size = max(5, (n - 1) // 4 + 1)
    locations = np.linspace(0, n - 1, low_size)
    lower = locations.astype(int)
    upper = np.minimum(lower + 1, n - 1)
    fraction = locations - lower
    low = (1 - fraction[:, None]) * (
        (1 - fraction[None, :]) * data[np.ix_(lower, lower)] + fraction[None, :] * data[np.ix_(lower, upper)]
    ) + fraction[:, None] * (
        (1 - fraction[None, :]) * data[np.ix_(upper, lower)] + fraction[None, :] * data[np.ix_(upper, upper)]
    )
    low.astype("<f4").tofile(out / "elevation" / "low.bin")
    meta["low_size"] = low_size
    (out / "metadata.json").write_text(json.dumps(meta, indent=2))
    return data, meta


def geo_to_scene(lon, lat, elevation, meta):
    e, n = Transformer.from_crs("EPSG:4326", meta["crs"], always_xy=True).transform(lon, lat)
    o = meta["origin"]
    return [e - o[0], elevation - o[2], o[1] - n]


def scene_to_geo(x, y, z, meta):
    o = meta["origin"]
    lon, lat = Transformer.from_crs(meta["crs"], "EPSG:4326", always_xy=True).transform(x + o[0], o[1] - z)
    return [lon, lat, y + o[2]]


def sample(data, meta, e, n):
    w, s, r, t = meta["grid_bounds"]
    if not (w <= e <= r and s <= n <= t):
        return None
    x = (e - w) / (r - w) * (data.shape[1] - 1)
    y = (t - n) / (t - s) * (data.shape[0] - 1)
    x0, y0 = int(x), int(y)
    x1, y1 = min(x0 + 1, data.shape[1] - 1), min(y0 + 1, data.shape[0] - 1)
    fx, fy = x - x0, y - y0
    return float(
        (1 - fy) * ((1 - fx) * data[y0, x0] + fx * data[y0, x1])
        + fy * ((1 - fx) * data[y1, x0] + fx * data[y1, x1])
    )
