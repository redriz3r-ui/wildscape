"""Bounded public-source point screening. No suitability scores or animal locations."""

import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

import httpx

DATA = Path(__file__).parent / "data"
LANDFIRE = "https://lfps.usgs.gov/arcgis/rest/services/Landfire_LF2025"
CRITICAL = "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Critical_Habitat/FeatureServer/0"
EPQS = "https://epqs.nationalmap.gov/v1/json"
GBIF = "https://api.gbif.org/v1/occurrence/search"
PROTOCOL = "https://www.fws.gov/media/mojave-desert-tortoise-pre-project-survey-protocol-2019pdf"


@lru_cache(maxsize=1)
def region():
    return json.loads((DATA / "region.geojson").read_text())


@lru_cache(maxsize=1)
def legends():
    return json.loads((DATA / "landfire2025.json").read_text())


def in_ring(lon, lat, ring):
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        cross = (lon - x1) * (y2 - y1) - (lat - y1) * (x2 - x1)
        if (
            abs(cross) < 1e-10
            and min(x1, x2) - 1e-10 <= lon <= max(x1, x2) + 1e-10
            and min(y1, y2) - 1e-10 <= lat <= max(y1, y2) + 1e-10
        ):
            return True
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_region(lon, lat):
    for feature in region()["features"]:
        g = feature["geometry"]
        polygons = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for rings in polygons:
            if in_ring(lon, lat, rings[0]) and not any(in_ring(lon, lat, r) for r in rings[1:]):
                return True
    return False


def get_json(url, params):
    with httpx.Client(
        timeout=httpx.Timeout(12, connect=5),
        follow_redirects=False,
        headers={"User-Agent": "WildScape/1.0 public ecological screening"},
    ) as client:
        response = client.get(url, params=params)
        response.raise_for_status()
        value = response.json()
    if not isinstance(value, dict) or value.get("error"):
        raise ValueError("Source returned no usable response")
    return value


def vegetation(key, lon, lat):
    source = f"{LANDFIRE}/LF2025_{key}_CONUS/ImageServer"
    result = get_json(
        source + "/identify",
        {
            "f": "json",
            "geometry": json.dumps({"x": lon, "y": lat, "spatialReference": {"wkid": 4326}}),
            "geometryType": "esriGeometryPoint",
            "returnGeometry": "false",
            "returnCatalogItems": "false",
        },
    )
    value = str(result.get("value", "NoData"))
    table = legends()[key]
    row = table["classes"].get(value, {})
    return {
        "status": "nodata" if value == "NoData" else "ok",
        "title": {
            "EVT": "Existing vegetation type",
            "EVC": "Vegetation cover",
            "EVH": "Vegetation height",
        }[key],
        "source": source,
        "release": "LANDFIRE 2025",
        "resolutionM": 30,
        "code": None if value == "NoData" else value,
        "label": row.get("EVT_NAME")
        or row.get("CLASSNAMES")
        or ("No mapped value" if value == "NoData" else "Class label unavailable"),
        "legendSource": table["source"],
        "interpretation": "Mapped 30 m vegetation class; field verification required.",
    }


def elevation(lon, lat):
    data = get_json(
        EPQS, {"x": lon, "y": lat, "wkid": 4326, "units": "Meters", "includeDate": "true"}
    )
    value = float(data["value"])
    if not math.isfinite(value) or value < -1000:
        raise ValueError("Elevation unavailable")
    return {
        "status": "ok",
        "title": "Ground elevation",
        "source": EPQS,
        "valueM": round(value, 1),
        "resolutionM": data.get("resolution"),
        "acquisitionDate": data.get("attributes", {}).get("AcquisitionDate"),
        "interpretation": "USGS elevation point query; source resolution and acquisition date may vary.",
    }


def critical_habitat(lon, lat):
    data = get_json(
        CRITICAL + "/query",
        {
            "f": "json",
            "where": "sciname = 'Gopherus agassizii'",
            "geometry": f"{lon},{lat}",
            "geometryType": "esriGeometryPoint",
            "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "comname,sciname,unitname,unit,status,pubdate,effectdate,vacatedate,fedreg",
            "returnGeometry": "false",
        },
    )
    if "features" not in data or data.get("exceededTransferLimit"):
        raise ValueError("Incomplete critical habitat query")
    entries = [f["attributes"] for f in data["features"]]
    return {
        "status": "ok",
        "title": "Mapped final critical habitat",
        "source": CRITICAL,
        "intersects": bool(entries),
        "units": entries,
        "interpretation": "Point intersection with the USFWS GIS layer. Not a legal boundary determination or a habitat-suitability assessment; check the cited rule and agency sources.",
    }


def occurrences(lon, lat, radius):
    dy = radius / 111320
    dx = radius / (111320 * math.cos(math.radians(lat)))
    bbox = [lon - dx, lat - dy, lon + dx, lat + dy]
    totals = {}
    for license_key in ("CC0_1_0", "CC_BY_4_0"):
        data = get_json(
            GBIF,
            {
                "taxonKey": 2441814,
                "hasCoordinate": "true",
                "hasGeospatialIssue": "false",
                "occurrenceStatus": "PRESENT",
                "decimalLongitude": f"{bbox[0]},{bbox[2]}",
                "decimalLatitude": f"{bbox[1]},{bbox[3]}",
                "license": license_key,
                "limit": 0,
            },
        )
        if type(data.get("count")) is not int:
            raise ValueError("Occurrence count unavailable")
        totals[license_key] = data["count"]
    return {
        "status": "ok",
        "title": "Public tortoise record context",
        "source": "https://www.gbif.org/species/2441814",
        "count": sum(totals.values()),
        "licenseCounts": totals,
        "bounds": bbox,
        "halfWidthM": radius,
        "taxon": "Gopherus agassizii",
        "taxonKey": 2441814,
        "interpretation": "Counts of CC0/CC BY GBIF records with public coordinates inside the search box; records are not individuals. Generalized locations may be displaced. Uncertain records centered outside this box are not counted. No records does not mean absence. Exact animal locations are not returned.",
    }


def profile(lon, lat, radius=5000):
    if not in_region(lon, lat):
        raise ValueError("Select a point within the outlined Mojave Basin and Range pilot region.")
    jobs = {
        "elevation": lambda: elevation(lon, lat),
        "evt": lambda: vegetation("EVT", lon, lat),
        "evc": lambda: vegetation("EVC", lon, lat),
        "evh": lambda: vegetation("EVH", lon, lat),
        "criticalHabitat": lambda: critical_habitat(lon, lat),
        "occurrences": lambda: occurrences(lon, lat, radius),
    }

    def run(item):
        key, fn = item
        try:
            value = fn()
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            value = {
                "status": "unavailable",
                "title": key,
                "interpretation": "The source could not be retrieved. This is missing evidence, not a negative result.",
            }
        value["retrievedAt"] = datetime.now(timezone.utc).isoformat()
        return key, value

    with ThreadPoolExecutor(max_workers=6) as executor:
        sources = dict(executor.map(run, jobs.items()))
    return {
        "schema": 1,
        "longitude": lon,
        "latitude": lat,
        "coordinateSystem": "WGS84 / EPSG:4326",
        "region": "Mojave Basin and Range",
        "focalSpecies": "Gopherus agassizii",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "protocolSource": PROTOCOL,
        "fieldChecks": [
            "Record substrate and evidence of burrowing or shelter sites.",
            "Record forage plants and perennial vegetation structure.",
            "Document disturbance, barriers and access constraints.",
            "Choose survey method, season and effort with the reviewing biologist and applicable agency guidance.",
        ],
        "suitability": "Not modeled. These attributes support survey planning and do not predict occupancy or authorize survey/handling activities.",
    }


def record_areas(lon, lat, cell_km=25, since_year=0):
    """Rank 4×4 broad cells near a Mojave map center using count-only GBIF queries."""
    if not in_region(lon, lat):
        raise ValueError("Center the map within the Mojave pilot region before searching.")
    if cell_km not in (25, 50):
        raise ValueError("Choose a supported area size.")
    if since_year not in (0, 2015, 2020):
        raise ValueError("Choose a supported observation year range.")
    lat_step = cell_km / 111.32
    lon_step = cell_km / (111.32 * math.cos(math.radians(lat)))
    cells = []
    for row in range(4):
        for column in range(4):
            x0 = lon + (column - 2) * lon_step
            y0 = lat + (row - 2) * lat_step
            bbox = [x0, y0, x0 + lon_step, y0 + lat_step]
            center = [x0 + lon_step / 2, y0 + lat_step / 2]
            if in_region(*center):
                cells.append({"bounds": bbox, "center": center})

    def query(cell):
        west, south, east, north = cell["bounds"]
        try:
            result = get_json(
                GBIF,
                {
                    "taxonKey": 2441814,
                    "hasCoordinate": "true",
                    "hasGeospatialIssue": "false",
                    "occurrenceStatus": "PRESENT",
                    "decimalLongitude": f"{west},{east - 0.0000001}",
                    "decimalLatitude": f"{south},{north - 0.0000001}",
                    "license": ["CC0_1_0", "CC_BY_4_0"],
                    "limit": 0,
                    **(
                        {"year": f"{since_year},{datetime.now(timezone.utc).year}"}
                        if since_year
                        else {}
                    ),
                },
            )
            count = result.get("count")
            if type(count) is not int or count < 0:
                raise ValueError("Invalid record count")
            cell["status"] = "ok"
            cell["count"] = count
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            cell["status"] = "unavailable"
            cell["count"] = None
        return cell

    with ThreadPoolExecutor(max_workers=6) as executor:
        areas = list(executor.map(query, cells))
    areas.sort(key=lambda c: (c["status"] != "ok", -(c["count"] or 0)))
    return {
        "schema": 1,
        "region": "Mojave Basin and Range",
        "focalSpecies": "Gopherus agassizii",
        "center": [lon, lat],
        "cellSizeKm": cell_km,
        "sinceYear": since_year,
        "status": "complete" if all(c["status"] == "ok" for c in areas) else "partial",
        "areas": areas,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "source": "https://www.gbif.org/species/2441814",
        "method": f"GBIF count-only queries for public CC0/CC BY present records with coordinates and no flagged geospatial issue, in equal-size approximate boxes. Year filter: {str(since_year) + ' onward' if since_year else 'all available years'}. Cells are included when their centers lie within the EPA Mojave planning region. Boxes can cross its boundary.",
        "interpretation": "Counts are published records, not individual tortoises or independent sightings. Repeated survey effort, records from the same event, generalized coordinates and data gaps can create concentrations. High count is not a habitat suitability or occupancy score; zero records is not evidence of absence. No exact animal locations are returned.",
    }
