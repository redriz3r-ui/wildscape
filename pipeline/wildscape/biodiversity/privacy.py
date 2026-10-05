import math
from pyproj import Transformer

_TO = Transformer.from_crs(4326, 6933, always_xy=True)
_FROM = Transformer.from_crs(6933, 4326, always_xy=True)


def public_record(r, config):
    sensitive = r["is_sensitive"] or r["taxon_id"] in [str(x) for x in config.get("sensitive_taxon_ids", [])]
    lon, lat = r["longitude"], r["latitude"]
    grid = max(5000, float(config.get("public_grid_m", 5000)), r["uncertainty_m"] if sensitive else 0)
    if sensitive:
        x, y = _TO.transform(lon, lat)
        lon, lat = _FROM.transform((math.floor(x / grid) + 0.5) * grid, (math.floor(y / grid) + 0.5) * grid)
    # Allowlist only. Never spread raw/normalized objects into public records.
    result = {
        "id": r["id"],
        "taxon_id": r["taxon_id"],
        "longitude": round(lon, 6),
        "latitude": round(lat, 6),
        "event_date": r["event_date"],
        "basis_of_record": r["basis_of_record"],
        "uncertainty_m": max(r["uncertainty_m"], grid / math.sqrt(2)) if sensitive else r["uncertainty_m"],
        "source": r["source"],
        "source_dataset": r["source_dataset"],
        "license": r["license"],
        "is_sensitive": bool(sensitive),
        "is_obscured": r["is_obscured"],
        "is_historical": r["is_historical"],
        "quality_flags": r["quality_flags"],
        "fixture": r["fixture"],
        "generalization_m": grid if sensitive else 0,
    }
    # Sensitive record IDs/links can re-identify private source coordinates: omit them.
    if not sensitive and r["source"] == "gbif" and r["source_record_id"].isdigit():
        result["source_url"] = "https://www.gbif.org/occurrence/" + r["source_record_id"]
    return result
