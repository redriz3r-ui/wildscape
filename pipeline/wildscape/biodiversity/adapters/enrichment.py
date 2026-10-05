import os
from wildscape.biodiversity.adapters.base import request


def inaturalist_observation(observation_id: int) -> dict:
    """Direct enrichment only; never ingest the complete iNaturalist corpus alongside GBIF."""
    data = request(f"https://api.inaturalist.org/v1/observations/{int(observation_id)}").json()
    return data["results"][0] if data.get("results") else {}


def natureserve_search(scientific_name: str) -> dict:
    """Official Explorer API. No sensitivity inference from an absent response."""
    import httpx

    headers = {}
    if os.getenv("NATURESERVE_API_KEY"):
        headers["X-Api-Key"] = os.environ["NATURESERVE_API_KEY"]
    payload = {
        "criteriaType": "species",
        "textCriteria": [
            {
                "paramType": "textSearch",
                "searchToken": scientific_name,
                "matchAgainst": "scientificName",
                "operator": "equals",
            }
        ],
        "pagingOptions": {"page": 0, "recordsPerPage": 10},
    }
    response = httpx.post(
        "https://explorer.natureserve.org/api/data/speciesSearch", json=payload, headers=headers, timeout=45
    )
    response.raise_for_status()
    return response.json()


def usfws_query(layer_url: str, scientific_name: str, field="scientificName") -> dict:
    """Configure an authorized official FeatureServer layer and its scientific-name field."""
    from urllib.parse import urlparse

    host = urlparse(layer_url).hostname or ""
    if not (host.endswith(".fws.gov") or host.endswith(".arcgis.com")):
        raise ValueError("Use an official USFWS/ArcGIS service layer")
    if not field.replace("_", "").isalnum():
        raise ValueError("Invalid scientific-name field")
    escaped = scientific_name.replace("'", "''")
    return request(
        layer_url.rstrip("/") + "/query",
        {"f": "json", "where": f"{field} = '{escaped}'", "outFields": "*", "returnGeometry": "false"},
    ).json()
