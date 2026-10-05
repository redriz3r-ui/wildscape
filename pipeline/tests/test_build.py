import json
import hashlib
import jsonschema
from shapely.geometry import Point
from wildscape.config import ROOT
from wildscape.build.world import workdir

SCHEMA = {
    "type": "object",
    "required": [
        "id",
        "name",
        "schema_version",
        "bbox",
        "species_count",
        "occurrence_count",
        "assets",
        "terrain",
        "built_at",
        "fixture",
    ],
    "properties": {
        "schema_version": {"const": 1},
        "bbox": {"type": "array", "minItems": 4, "maxItems": 4},
        "species_count": {"type": "integer", "minimum": 0},
        "occurrence_count": {"type": "integer", "minimum": 0},
    },
}


def test_manifest_counts_and_assets(built):
    folder = ROOT / "public/worlds/mojave-fixture"
    manifest = json.loads((folder / "manifest.json").read_text())
    jsonschema.validate(manifest, SCHEMA)
    species = json.loads((folder / "species/index.json").read_text())
    records = json.loads((folder / "observations/index.json").read_text())
    assert manifest["occurrence_count"] == len(records) == 180
    assert manifest["species_count"] == len([s for s in species if s["rank"] == "SPECIES"]) == 12
    assert sum(s["count"] for s in species) == len(records)
    assert all((folder / name).is_file() for name in manifest["assets"].values())
    assert len({r["id"] for r in records}) == len(records)


def test_public_json_privacy_scan(built):
    folder = ROOT / "public/worlds/mojave-fixture"
    precise = {r["id"]: r for r in json.loads((workdir(built) / "canonical.json").read_text())}
    forbidden = {
        "payload",
        "raw_payload",
        "precise_geom",
        "verbatimLatitude",
        "verbatimLongitude",
        "source_record_id",
        "external_id",
    }

    def scan(obj):
        if isinstance(obj, dict):
            assert not forbidden.intersection(obj)
            for value in obj.values():
                scan(value)
        elif isinstance(obj, list):
            for value in obj:
                scan(value)

    for path in folder.rglob("*.json"):
        scan(json.loads(path.read_text()))
    for p in (folder / "observations/detail").glob("*.json"):
        r = json.loads(p.read_text())
        if r["is_sensitive"]:
            assert r["generalization_m"] >= 5000
            assert [r["latitude"], r["longitude"]] != [
                precise[r["id"]]["latitude"],
                precise[r["id"]]["longitude"],
            ]
            assert "source_url" not in r
        if not built["_geometry"].covers(Point(r["longitude"], r["latitude"])):
            assert r["outside_aoi"] and r["is_sensitive"]


def test_asset_checksums(built):
    folder = ROOT / "public/worlds/mojave-fixture"
    checks = json.loads((folder / "checksums.json").read_text())
    assert checks
    for name, row in checks.items():
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == row["sha256"]


def test_fixture_duplicate_and_historical_exercised(built):
    rows = json.loads((workdir(built) / "canonical.json").read_text())
    assert sum(bool(r["duplicate_of"]) for r in rows) == 1
    assert any(r["is_historical"] for r in rows)
    assert any(r["is_sensitive"] for r in rows)


def test_vegetation_deterministic(built, tmp_path):
    from wildscape.build.world import terrain

    terrain(built, tmp_path / "terrain")
    existing = ROOT / "public/worlds/mojave-fixture/vegetation/placement.json"
    assert existing.read_bytes() == (tmp_path / "vegetation/placement.json").read_bytes()
    rows = json.loads(existing.read_text())
    assert len(rows) > 1000
    assert sum(row[0] == "joshua" for row in rows) / len(rows) < 0.03


def test_informational_gbif_coordinate_flags_remain_usable(raw):
    from wildscape.biodiversity.normalize import normalize

    raw["issues"] = ["CONTINENT_DERIVED_FROM_COORDINATES", "COORDINATE_ROUNDED"]
    raw["hasGeospatialIssues"] = False
    row = normalize(raw, "gbif")
    assert not row["has_geospatial_issue"]
    assert "source_issue:COORDINATE_ROUNDED" in row["quality_flags"]
    raw["issues"] = ["COORDINATE_OUT_OF_RANGE"]
    assert normalize(raw, "gbif")["has_geospatial_issue"]


def test_gbif_squamata_class_maps_to_reptiles(raw):
    from wildscape.biodiversity.normalize import taxon

    raw.update({"kingdom": "Animalia", "class": "Squamata"})
    assert taxon(raw)["group"] == "Reptiles"
