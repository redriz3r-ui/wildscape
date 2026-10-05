from datetime import date
import hashlib
import math
import re


def truth(value):
    return value is True or str(value).strip().lower() in ("true", "1", "yes")


def taxon(record):
    key = record.get("speciesKey") or record.get("acceptedTaxonKey") or record.get("taxonKey")
    name = record.get("species") or record.get("acceptedScientificName") or record.get("scientificName")
    if not key or not name:
        return None
    group = {
        "Mammalia": "Mammals",
        "Aves": "Birds",
        "Reptilia": "Reptiles",
        "Squamata": "Reptiles",
        "Testudines": "Reptiles",
        "Crocodylia": "Reptiles",
        "Amphibia": "Amphibians",
        "Insecta": "Arthropods",
        "Arachnida": "Arthropods",
    }.get(record.get("class"), "Other")
    if record.get("kingdom") == "Plantae":
        group = "Plants"
    return {
        "id": str(key),
        "name": name,
        "common_name": record.get("vernacularName") or name,
        "rank": "SPECIES" if record.get("speciesKey") else record.get("taxonRank", "UNKNOWN"),
        "group": group,
        "parent_taxonomy": {
            k: record[k] for k in ("kingdom", "phylum", "class", "order", "family") if k in record
        },
        "source_taxon_ids": {"gbif": str(key)}
        if not str(key).startswith("fixture")
        else {"fixture": str(key)},
    }


def normalize(record, source):
    flags = []
    try:
        lon, lat = float(record["decimalLongitude"]), float(record["decimalLatitude"])
        valid = math.isfinite(lon) and math.isfinite(lat) and -180 <= lon <= 180 and -90 <= lat <= 90
    except (KeyError, TypeError, ValueError):
        valid = False
        lon = lat = 0
    if not valid:
        return None
    t = taxon(record)
    if not t:
        return None
    event = str(record.get("eventDate", ""))
    try:
        d = date.fromisoformat(event[:10])
        date_valid = d <= date.today()
    except ValueError:
        date_valid = False
    if not date_valid:
        flags.append("date_invalid")
    source_id = str(
        record.get("key") or record.get("gbifID") or record.get("id") or record.get("occurrenceID") or ""
    )
    if not source_id:
        raise ValueError("Raw occurrence lacks a stable source identifier")
    try:
        uncertainty = max(0, float(record.get("coordinateUncertaintyInMeters") or 0))
        if not math.isfinite(uncertainty):
            raise ValueError()
    except (ValueError, TypeError):
        uncertainty = 0
        flags.append("uncertainty_invalid")
    issues = record.get("issues", []) or []
    if isinstance(issues, str):
        issues = re.split(r"[;,|]", issues)
    obscured = bool(
        record.get("geoprivacy") in ("obscured", "private")
        or record.get("taxon_geoprivacy")
        or truth(record.get("coordinates_obscured"))
        or record.get("informationWithheld")
        or record.get("dataGeneralizations")
    )
    identifier = hashlib.sha256(f"{source}:{source_id}".encode()).hexdigest()[:20]
    return {
        "id": identifier,
        "taxon": t,
        "taxon_id": t["id"],
        "reported_scientific_name": record.get("scientificName"),
        "infraspecies": record.get("infraspecificEpithet"),
        "event_date": event if date_valid else None,
        "basis_of_record": record.get("basisOfRecord", "UNKNOWN"),
        "longitude": lon,
        "latitude": lat,
        "uncertainty_m": uncertainty,
        "source": source,
        "source_record_id": source_id,
        "source_dataset": record.get("datasetKey") or "user-field-data",
        "external_id": record.get("occurrenceID"),
        "license": record.get("license", "unspecified"),
        "event_id": record.get("eventID"),
        "collector_id": record.get("recordedByID"),
        "has_geospatial_issue": bool(
            truth(record.get("hasGeospatialIssues"))
            or any(
                i
                in {
                    "COORDINATE_INVALID",
                    "COORDINATE_OUT_OF_RANGE",
                    "ZERO_COORDINATE",
                    "COUNTRY_COORDINATE_MISMATCH",
                }
                for i in issues
            )
        ),
        "is_sensitive": bool(truth(record.get("is_sensitive")) or obscured),
        "is_obscured": obscured,
        "is_historical": bool(date_valid and event[:4] < "1990"),
        "occurrence_status": record.get("occurrenceStatus", "PRESENT"),
        "quality_flags": ["coordinate_valid", "accepted_taxon_match"]
        + (["date_valid"] if date_valid else [])
        + flags
        + ["source_issue:" + i for i in issues if i],
        "media": record.get("media") if isinstance(record.get("media"), list) else [],
        "fixture": truth(record.get("fixture")),
    }
