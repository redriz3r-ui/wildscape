import json
import httpx
from pathlib import Path
from wildscape.biodiversity.adapters.base import request

DEM_SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer"
NAIP_SERVICE = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer"


def export_image(service: str, bbox: list, destination: Path, size=1024, elevation=False):
    params = {
        "f": "json",
        "bbox": ",".join(map(str, bbox)),
        "bboxSR": 4326,
        "imageSR": 4326,
        "size": f"{size},{size}",
        "format": "tiff",
        "adjustAspectRatio": "false",
        "interpolation": "RSP_BilinearInterpolation",
    }
    if elevation:
        params.update(pixelType="F32", renderingRule=json.dumps({"rasterFunction": "None"}))
    result = request(service + "/exportImage", params).json()
    if "href" not in result:
        raise ValueError(f"Official image service export failed: {result}")
    try:
        payload = request(result["href"]).content
    except (httpx.HTTPError, ValueError):
        # Some ArcGIS output-directory URLs expire or return gateway errors.
        payload = request(service + "/exportImage", {**params, "f": "image"}).content
    if payload[:2] not in (b"II", b"MM"):
        raise ValueError("Image service did not return a GeoTIFF")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(payload)
    destination.with_suffix(".source.json").write_text(
        json.dumps({"service": service, "request": params, "response": result}, indent=2)
    )
