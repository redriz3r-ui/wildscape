import json
import uuid
import hashlib
import csv
from datetime import datetime, timezone
from wildscape.config import ROOT
from wildscape.biodiversity.adapters.gbif import GBIFAdapter


def ingest(c, input_path=None, source="field"):
    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    folder = ROOT / "data_raw" / c["id"] / "ingests" / run_id
    folder.mkdir(parents=True)
    if input_path:
        if input_path.suffix.lower() in (".csv", ".tsv", ".txt"):
            delimiter = "," if input_path.suffix.lower() == ".csv" else "\t"
            with input_path.open(newline="", encoding="utf-8-sig") as source_file:
                records = list(csv.DictReader(source_file, delimiter=delimiter))
        else:
            records = json.loads(input_path.read_text())
        if not isinstance(records, list) or not all(isinstance(row, dict) for row in records):
            raise ValueError("Field import must be a JSON array or a CSV/TSV table of records")
        # Retain Darwin Core raw rows verbatim; normalization understands gbifID too.
        iterator = ((r, {"file": str(input_path)}) for r in records)
    elif c.get("fixture"):
        records = json.loads((ROOT / "fixtures" / "biodiversity" / "records.json").read_text())
        source = "fixture"
        iterator = ((r, {"fixture": "records.json"}) for r in records)
    else:
        source = "gbif"
        iterator = GBIFAdapter().records(c)
    count = 0
    # Unique immutable run directory; no overwrite of prior raw responses.
    with (folder / "raw.jsonl").open("x") as f:
        for raw, params in iterator:
            entry = {
                "ingest_run": run_id,
                "source": source,
                "retrieved_at": now,
                "request": params,
                "source_dataset": raw.get("datasetKey"),
                "source_identifier": raw.get("key", raw.get("id")),
                "license": raw.get("license"),
                "payload": raw,
            }
            f.write(json.dumps(entry) + "\n")
            count += 1
    meta = {
        "id": run_id,
        "world": c["id"],
        "source": source,
        "retrieved_at": now,
        "count": count,
        "sha256": hashlib.sha256((folder / "raw.jsonl").read_bytes()).hexdigest(),
    }
    (folder / "run.json").write_text(json.dumps(meta, indent=2))
    (folder.parent / "latest.txt").write_text(run_id)
    if not count:
        print("WARNING: source returned no records; build remains valid with empty evidence")
    return folder


def latest_run(c):
    base = ROOT / "data_raw" / c["id"] / "ingests"
    if not (base / "latest.txt").exists():
        raise ValueError("No ingest run; run ingest first")
    return base / (base / "latest.txt").read_text().strip()
