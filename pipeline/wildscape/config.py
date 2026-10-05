from pathlib import Path
import yaml
from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[2]


def load_world(world: str) -> dict:
    path = Path(world)
    if not path.is_file():
        path = ROOT / "worlds" / world / "world.yaml"
    try:
        c = yaml.safe_load(path.read_text())
    except (OSError, yaml.YAMLError) as e:
        raise ValueError(f"Invalid world YAML: {e}") from e
    if not isinstance(c, dict) or not all(k in c for k in ("id", "name", "aoi", "terrain")):
        raise ValueError("World requires id, name, aoi and terrain")
    if not c["id"].replace("-", "").replace("_", "").isalnum():
        raise ValueError("World id must be a safe directory name")
    if c.get("biodiversity", {}).get("start_date"):
        c["biodiversity"]["start_date"] = str(c["biodiversity"]["start_date"])
    a = c["aoi"]
    if a.get("method") == "configured_polygon":
        geom = shape(a["polygon"])
    elif a.get("bbox") and len(a["bbox"]) == 4:
        west, south, east, north = map(float, a["bbox"])
        if not (-180 <= west < east <= 180 and -80 <= south < north <= 84):
            raise ValueError("AOI bbox must be ordered W,S,E,N within supported UTM latitudes")
        geom = box(west, south, east, north)
    else:
        raise ValueError("AOI required: configure bbox/polygon, or run find-aoi with a LANDFIRE raster")
    if not geom.is_valid or geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
        raise ValueError("AOI must be a valid polygon")
    if not c.get("fixture") and not a.get("verified"):
        raise ValueError("Real builds require aoi.verified: true after source/coverage review")
    if c.get("privacy", {}).get("protect_sensitive_taxa") is False:
        raise ValueError("Public exports may not disable sensitive-species protection")
    if c.get("privacy", {}).get("public_grid_m", 5000) < 5000:
        raise ValueError("Sensitive public grid must be at least 5000 meters")
    c["aoi"]["bbox"] = list(geom.bounds)
    c["_geometry"] = geom
    c["_path"] = str(path.resolve())
    return c


def source_path(c: dict, key: str) -> Path:
    value = c.get("terrain", {}).get(key) or c.get("vegetation", {}).get(key)
    if value:
        path = Path(value)
        return path if path.is_absolute() else ROOT / path
    if c.get("fixture"):
        return ROOT / "fixtures" / "terrain" / f"{key}.tif"
    return ROOT / "data_raw" / c["id"] / f"{key}.tif"
