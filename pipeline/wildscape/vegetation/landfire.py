import json
from wildscape.biodiversity.adapters.base import request


def download_wcs(endpoint, coverage, bbox, destination, crs="EPSG:4326", width=1024):
    """Official WCS 1.0 request; coverage identifier is selected from GetCapabilities."""
    params = {
        "service": "WCS",
        "version": "1.0.0",
        "request": "GetCoverage",
        "coverage": coverage,
        "CRS": crs,
        "response_crs": crs,
        "bbox": ",".join(map(str, bbox)),
        "width": width,
        "height": width,
        "format": "GeoTIFF",
    }
    response = request(endpoint, params)
    if response.content[:2] not in (b"II", b"MM"):
        raise ValueError("LANDFIRE returned a service error instead of GeoTIFF: " + response.text[:300])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(response.content)
    destination.with_suffix(".source.json").write_text(
        json.dumps({"endpoint": endpoint, "params": params}, indent=2)
    )
