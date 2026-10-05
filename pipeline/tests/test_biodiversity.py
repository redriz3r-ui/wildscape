import json
from copy import deepcopy
import pytest
from wildscape.config import ROOT
from wildscape.biodiversity.normalize import normalize
from wildscape.biodiversity.dedupe import dedupe
from wildscape.biodiversity.privacy import public_record
from wildscape.biodiversity.media import allowed_media
from wildscape.biodiversity.ingest import latest_run


def test_raw_ingest_preserved(built):
    path = latest_run(built)
    raw = json.loads((ROOT / "fixtures/biodiversity/records.json").read_text())
    entries = [json.loads(line) for line in (path / "raw.jsonl").read_text().splitlines()]
    assert [entry["payload"] for entry in entries] == raw
    assert all(entry["retrieved_at"] and entry["ingest_run"] and entry["request"] for entry in entries)


def test_normalize_taxonomy(raw):
    raw["scientificName"] = "Reported synonym"
    r = normalize(raw, "fixture")
    assert r["reported_scientific_name"] == "Reported synonym"
    assert r["taxon"]["name"] == "Coleogyne ramosissima"
    assert r["taxon"]["rank"] == "SPECIES" and r["taxon"]["group"] == "Plants"


@pytest.mark.parametrize("value", [None, "invalid", 999, float("nan")])
def test_invalid_coordinates_excluded(raw, value):
    raw["decimalLatitude"] = value
    assert normalize(raw, "fixture") is None


def test_certain_duplicate(raw):
    a = normalize(raw, "fixture")
    rows = dedupe([a, a])
    assert rows[1]["duplicate_of"] == rows[0]["id"]


def test_cross_provider_duplicate(raw):
    a = normalize({**raw, "occurrenceID": "https://www.inaturalist.org/observations/123"}, "gbif")
    b = normalize({**raw, "key": "123", "occurrenceID": None}, "inaturalist")
    rows = dedupe([a, b])
    assert rows[1]["duplicate_of"] == rows[0]["id"]


def test_nearby_records_not_duplicates(raw):
    a = normalize(raw, "fixture")
    b = normalize({**raw, "key": "other", "occurrenceID": "urn:other"}, "fixture")
    assert not dedupe([a, b])[1]["duplicate_of"]


def test_probable_records_preserved(raw):
    a = normalize({**raw, "eventID": "event1"}, "fixture")
    b = normalize({**raw, "key": "other", "occurrenceID": "urn:other", "eventID": "event1"}, "fixture")
    r = dedupe([a, b])[1]
    assert r["duplicate_of"] is None and r["probable_duplicates"] == [a["id"]]


def test_bare_provider_ids_not_globally_deduped(raw):
    a = normalize({**raw, "occurrenceID": "1"}, "sourceA")
    b = normalize({**raw, "occurrenceID": "1"}, "sourceB")
    assert not dedupe([a, b])[1]["duplicate_of"]


def test_public_privacy_allowlist(raw):
    r = normalize(raw, "gbif")
    r.update(is_sensitive=True, source_record_id="123", verbatimLatitude=r["latitude"], payload=deepcopy(raw))
    p = public_record(r, {"public_grid_m": 5000})
    assert p["latitude"] != r["latitude"] and p["longitude"] != r["longitude"]
    assert p["uncertainty_m"] >= 3500 and p["generalization_m"] == 5000
    for key in (
        "source_record_id",
        "external_id",
        "source_url",
        "verbatimLatitude",
        "payload",
        "geometry",
        "media",
    ):
        assert key not in p


def test_obscured_remains_protected(raw):
    r = normalize({**raw, "geoprivacy": "obscured", "coordinateUncertaintyInMeters": 20000}, "fixture")
    p = public_record(r, {})
    assert p["is_obscured"] and p["is_sensitive"] and p["generalization_m"] >= 20000


def test_media_license_and_attribution():
    media = [
        {
            "identifier": "https://example.org/a.jpg",
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "creator": "A",
        },
        {"identifier": "https://example.org/b.jpg", "license": "CC-BY-NC", "creator": "B"},
        {"identifier": "https://example.org/c.jpg", "license": "CC-BY"},
        {"identifier": "javascript:alert(1)", "license": "CC0"},
        {"identifier": "https://example.org/d.jpg", "license": "unknown"},
    ]
    rows = allowed_media(media, ["CC0", "CC-BY", "CC-BY-SA"])
    assert len(rows) == 1 and rows[0]["creator"] == "A" and "CC-BY" in rows[0]["attribution"]


def test_tabular_false_values_are_not_truthy(raw):
    raw.update(
        hasGeospatialIssues="false",
        is_sensitive="false",
        fixture="false",
        coordinates_obscured="false",
        issues="",
    )
    row = normalize(raw, "field")
    assert not row["has_geospatial_issue"]
    assert not row["is_sensitive"]
    assert not row["fixture"]


def test_tabular_coordinate_issue_is_excluded(raw):
    raw["issues"] = "TAXON_MATCH_HIGHERRANK;COORDINATE_INVALID"
    assert normalize(raw, "field")["has_geospatial_issue"]
