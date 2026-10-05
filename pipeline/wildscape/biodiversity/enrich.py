"""Optional source enrichment with immutable responses and explicit privacy policy."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
import httpx
from wildscape.config import ROOT
from wildscape.biodiversity.adapters.enrichment import (
    natureserve_search,
    usfws_query,
    inaturalist_observation,
)


def enrich_world(c):
    folder = ROOT / "data_generated" / c["id"]
    normalized = folder / "normalized.json"
    rows = json.loads(normalized.read_text())
    options = c.get("enrichment", {})
    if not options:
        return
    timestamp = datetime.now(timezone.utc).isoformat()
    raw_folder = ROOT / "data_raw" / c["id"] / "enrichments" / str(uuid.uuid4())
    raw_folder.mkdir(parents=True)
    metadata = {}
    warnings = []
    # An authorized metadata import can carry location sensitivity unavailable in public services.
    if options.get("metadata_file"):
        source = Path(options["metadata_file"])
        if not source.is_absolute():
            source = ROOT / source
        imported = json.loads(source.read_text())
        (raw_folder / "authorized-metadata.json").write_bytes(source.read_bytes())
        metadata.update({str(item["taxon_id"]): item for item in imported})
    taxa = {r["taxon_id"]: r["taxon"] for r in rows}
    for key, taxon in taxa.items():
        meta = metadata.setdefault(key, {"conservation": []})
        if options.get("natureserve"):
            try:
                payload = natureserve_search(taxon["name"])
                (raw_folder / f"ns-{key}.json").write_text(
                    json.dumps({"retrieved_at": timestamp, "query": taxon["name"], "payload": payload})
                )
                hits = [
                    r
                    for r in payload.get("results", [])
                    if r.get("scientificName", "").casefold() == taxon["name"].casefold()
                ]
                if hits:
                    result = hits[0]
                    if result.get("primaryCommonNameLanguage") == "EN" and result.get("primaryCommonName"):
                        meta["common_name"] = result["primaryCommonName"]
                    rank = result.get("roundedGRank")
                    esa = result.get("speciesGlobal", {}).get("usesaCode")
                    meta.setdefault("conservation", []).append(
                        {
                            "authority": "NatureServe Explorer",
                            "status": rank,
                            "esa_status": esa,
                            "url": "https://explorer.natureserve.org" + result.get("nsxUrl", ""),
                            "retrieved_at": timestamp,
                            "license": "NatureServe attribution required; see source terms",
                        }
                    )
                    # This is a conservative project policy, not an assertion of NatureServe location sensitivity.
                    if options.get("protect_at_risk", True) and (rank in ("G1", "G2") or esa in ("E", "T")):
                        meta["is_sensitive"] = True
                        meta["sensitivity_reason"] = "Wildscape precaution: NatureServe G1/G2 or ESA E/T"
            except (ValueError, httpx.HTTPError) as e:
                warnings.append(f"NatureServe optional enrichment unavailable for {taxon['name']}: {e}")
        if options.get("usfws_layer"):
            try:
                payload = usfws_query(
                    options["usfws_layer"], taxon["name"], options.get("usfws_name_field", "scientificName")
                )
                (raw_folder / f"usfws-{key}.json").write_text(
                    json.dumps({"retrieved_at": timestamp, "payload": payload})
                )
                for feature in payload.get("features", []):
                    status = feature.get("attributes", {}).get(options.get("usfws_status_field", "status"))
                    if status:
                        meta.setdefault("conservation", []).append(
                            {
                                "authority": "USFWS",
                                "status": str(status),
                                "url": options["usfws_layer"],
                                "retrieved_at": timestamp,
                            }
                        )
            except (ValueError, httpx.HTTPError) as e:
                warnings.append(f"USFWS optional enrichment unavailable: {e}")
    for r in rows:
        meta = metadata.get(r["taxon_id"], {})
        r["is_sensitive"] = bool(r["is_sensitive"] or meta.get("is_sensitive"))
        r["taxon"]["conservation"] = meta.get("conservation", [])
        if meta.get("common_name"):
            r["taxon"]["common_name"] = meta["common_name"]
        # Direct source access enriches only known original-provider IDs; precise coordinates are never imported.
        if options.get("inaturalist") and not r["is_sensitive"]:
            external = str(r.get("external_id") or "")
            if "inaturalist.org/observations/" in external:
                identifier = external.rstrip("/").split("/")[-1]
                if identifier.isdigit():
                    try:
                        response = inaturalist_observation(int(identifier))
                        (raw_folder / f"inat-{identifier}.json").write_text(
                            json.dumps({"retrieved_at": timestamp, "payload": response})
                        )
                        if (
                            response.get("geoprivacy")
                            or response.get("taxon_geoprivacy")
                            or response.get("obscured")
                        ):
                            r["is_sensitive"] = True
                            r["is_obscured"] = True
                        else:
                            for photo in response.get("photos", []):
                                url = photo.get("url", "")
                                r["media"].append(
                                    {
                                        "identifier": url.replace("/square.", "/medium."),
                                        "thumbnail_url": url,
                                        "license": photo.get("license_code", ""),
                                        "creator": photo.get("attribution"),
                                        "attribution": photo.get("attribution"),
                                        "references": f"https://www.inaturalist.org/observations/{identifier}",
                                    }
                                )
                    except (ValueError, httpx.HTTPError) as e:
                        warnings.append(f"iNaturalist optional enrichment unavailable: {e}")
    normalized.write_text(json.dumps(rows, separators=(",", ":")))
    (folder / "enrichment-warnings.json").write_text(json.dumps(warnings))
    (raw_folder / "run.json").write_text(
        json.dumps({"retrieved_at": timestamp, "options": options, "warnings": warnings})
    )
    for warning in warnings:
        print("WARNING:", warning)
