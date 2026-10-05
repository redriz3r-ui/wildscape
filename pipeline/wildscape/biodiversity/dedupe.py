from urllib.parse import urlparse
from collections import defaultdict


def provider_key(record):
    value = str(record.get("external_id") or "").strip().rstrip("/")
    if "inaturalist.org/observations/" in value:
        return "inat:" + urlparse(value).path.split("/")[-1]
    if record["source"] == "inaturalist":
        return "inat:" + record["source_record_id"]
    # Arbitrary bare IDs are not globally unique across publishers.
    return value if value.startswith(("http://", "https://", "urn:")) else None


def dedupe(records):
    certain = {}
    providers = {}
    out = []
    candidates = defaultdict(list)
    for r in records:
        r = {**r, "duplicate_of": None, "probable_duplicates": []}
        key = (r["source"], r["source_record_id"])
        external = provider_key(r)
        existing = certain.get(key) or (providers.get(external) if external else None)
        if existing:
            r["duplicate_of"] = existing["id"]
        else:
            certain[key] = r
            if external:
                providers[external] = r
            bucket = (r["taxon_id"], r["event_date"])
            for prior in candidates[bucket]:
                evidence = (r.get("event_id") and r["event_id"] == prior.get("event_id")) or (
                    r.get("collector_id") and r["collector_id"] == prior.get("collector_id")
                )
                if (
                    not prior["duplicate_of"]
                    and r["taxon_id"] == prior["taxon_id"]
                    and r["event_date"]
                    and r["event_date"] == prior["event_date"]
                    and evidence
                    and abs(r["longitude"] - prior["longitude"]) < 0.0001
                    and abs(r["latitude"] - prior["latitude"]) < 0.0001
                ):
                    r["probable_duplicates"].append(prior["id"])
            if r.get("event_id") or r.get("collector_id"):
                candidates[bucket].append(r)
        out.append(r)
    return out
