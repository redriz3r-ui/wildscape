import json
import os
import psycopg
from psycopg.types.json import Jsonb
from wildscape.config import ROOT
from wildscape.build.world import workdir
from wildscape.biodiversity.ingest import latest_run

DEFAULT_URL = "postgresql://wildscape:wildscape@127.0.0.1:55432/wildscape"


def connect():
    try:
        return psycopg.connect(os.getenv("DATABASE_URL", DEFAULT_URL), connect_timeout=5)
    except psycopg.OperationalError as e:
        raise ValueError("Database unavailable; run make db-up and check DATABASE_URL") from e


def migrate():
    with connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)")
        for p in sorted((ROOT / "db" / "migrations").glob("*.sql")):
            if not conn.execute("SELECT 1 FROM schema_migrations WHERE name=%s", (p.name,)).fetchone():
                # Compose initializes the same SQL on first volume creation.
                existing = conn.execute("SELECT to_regclass('public.regions')").fetchone()[0]
                if not existing or p.name != "001_core.sql":
                    conn.execute(p.read_text())
                conn.execute("INSERT INTO schema_migrations VALUES (%s)", (p.name,))


def sync(c):
    migrate()
    run_path = latest_run(c)
    run = json.loads((run_path / "run.json").read_text())
    canonical = json.loads((workdir(c) / "canonical.json").read_text())
    public = {r["id"]: r for r in json.loads((workdir(c) / "public.json").read_text())}
    config = {k: v for k, v in c.items() if not k.startswith("_")}
    with connect() as conn:
        conn.execute(
            "INSERT INTO regions VALUES (%s,%s,ST_Multi(ST_GeomFromText(%s,4326)),%s) ON CONFLICT(id) DO UPDATE SET config=excluded.config,geom=excluded.geom",
            (c["id"], c["name"], c["_geometry"].wkt, Jsonb(config)),
        )
        conn.execute(
            "INSERT INTO ingest_runs VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
            (run["id"], c["id"], run["source"], run["retrieved_at"], Jsonb(run)),
        )
        for i, line in enumerate((run_path / "raw.jsonl").read_text().splitlines()):
            r = json.loads(line)
            conn.execute(
                "INSERT INTO raw_records(ingest_run,ordinal,source_id,payload) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (run["id"], i, str(r.get("source_identifier")), Jsonb(r)),
            )
        seen = set()
        for r in canonical:
            if r["id"] in seen:
                continue
            seen.add(r["id"])
            t = r["taxon"]
            p = public.get(r["id"])
            conn.execute(
                "INSERT INTO taxa VALUES (%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata",
                (t["id"], t["name"], t["rank"], Jsonb(t)),
            )
            for source, key in t["source_taxon_ids"].items():
                conn.execute(
                    "INSERT INTO taxon_xrefs VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (t["id"], source, key)
                )
            conn.execute(
                "INSERT INTO occurrences VALUES (%s,%s,ST_SetSRID(ST_Point(%s,%s),4326),ST_SetSRID(ST_Point(%s,%s),4326),%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET public_geom=excluded.public_geom,is_sensitive=excluded.is_sensitive,metadata=excluded.metadata",
                (
                    r["id"],
                    t["id"],
                    r["longitude"],
                    r["latitude"],
                    p["longitude"] if p else None,
                    p["latitude"] if p else None,
                    r["event_date"],
                    bool(p and p["is_sensitive"]),
                    r["duplicate_of"],
                    Jsonb(r),
                ),
            )
            conn.execute(
                "INSERT INTO occurrence_sources VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (r["id"], r["source"], r["source_record_id"], run["id"]),
            )
            conn.execute(
                "INSERT INTO region_occurrences VALUES (%s,%s) ON CONFLICT DO NOTHING", (c["id"], r["id"])
            )
            for item in t.get("conservation", []):
                conn.execute(
                    "INSERT INTO conservation_status VALUES (%s,%s,%s,%s) ON CONFLICT(taxon_id,authority) DO UPDATE SET status=excluded.status,metadata=excluded.metadata",
                    (t["id"], item["authority"], item.get("status"), Jsonb(item)),
                )
            for item in r.get("media", []):
                url = item.get("identifier") or item.get("url")
                if url:
                    conn.execute(
                        "INSERT INTO media(taxon_id,occurrence_id,url,thumbnail_url,creator,source,license,attribution) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                        (
                            t["id"],
                            r["id"],
                            url,
                            item.get("thumbnail_url"),
                            item.get("creator"),
                            item.get("source"),
                            item.get("license"),
                            item.get("attribution"),
                        ),
                    )
            if p and p["is_sensitive"]:
                conn.execute(
                    "INSERT INTO sensitive_taxa VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (t["id"], int(p["generalization_m"]), "source or world privacy policy"),
                )
        manifest = ROOT / "public" / "worlds" / c["id"] / "manifest.json"
        if manifest.exists():
            conn.execute(
                "INSERT INTO builds(region_id,manifest) VALUES (%s,%s)",
                (c["id"], Jsonb(json.loads(manifest.read_text()))),
            )
    print(f"Database synchronized: {len(canonical)} canonical rows, immutable run {run['id']}")
