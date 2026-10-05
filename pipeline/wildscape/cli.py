import argparse
import json
import sys
from pathlib import Path
import httpx
from wildscape.config import load_world, source_path
from wildscape.fixtures import generate
from wildscape.biodiversity.ingest import ingest
from wildscape.biodiversity.enrich import enrich_world
from wildscape.build.world import normalize_world, dedupe_world, protect_world, build_world, terrain
from wildscape.region.aoi import find_candidates
from wildscape.terrain.remote import export_image, DEM_SERVICE, NAIP_SERVICE
from wildscape.vegetation.landfire import download_wcs
from wildscape import database


def main():
    parser = argparse.ArgumentParser(
        prog="wildscape", description="Build heavy, run light: static ecological worlds"
    )
    sub = parser.add_subparsers(dest="command", required=True)
    commands = [
        "validate-world",
        "fixtures",
        "prepare-terrain",
        "fetch-terrain",
        "ingest",
        "normalize",
        "enrich",
        "dedupe",
        "protect",
        "build-world",
        "all",
        "db-sync",
    ]
    for name in commands:
        p = sub.add_parser(name)
        p.add_argument("world")
        if name in ("ingest", "all"):
            p.add_argument("--input", type=Path)
            p.add_argument("--source", default="field")
        if name == "all":
            p.add_argument("--database", action="store_true")
    p = sub.add_parser("find-aoi")
    p.add_argument("--bps", type=int, required=True)
    p.add_argument("--size-km", type=float, default=15)
    p.add_argument("--raster", type=Path)
    p.add_argument(
        "--values", type=int, nargs="+", help="Raster VALUE IDs matching BPS_CODE in release attribute table"
    )
    p = sub.add_parser("fetch-landfire")
    p.add_argument("world")
    p.add_argument("--endpoint", required=True)
    p.add_argument("--coverage", required=True)
    p.add_argument("--layer", choices=["bps", "evt", "evc", "evh"], required=True)
    sub.add_parser("db-migrate")
    args = parser.parse_args()
    try:
        if args.command == "db-migrate":
            database.migrate()
            return
        if args.command == "find-aoi":
            if not args.raster or not args.values:
                raise ValueError(
                    "AOI discovery needs an official projected BpS raster and --values from its attribute table. BPS_CODE is not necessarily raster VALUE. Configure a reviewed bbox/polygon if remote access is unavailable."
                )
            print(json.dumps(find_candidates(args.raster, args.values, args.size_km), indent=2))
            return
        c = load_world(args.world)
        cmd = args.command
        if cmd == "validate-world":
            print(f"Valid {c['id']} (fixture={c.get('fixture', False)})")
        elif cmd == "fixtures":
            generate(c)
        elif cmd == "fetch-terrain":
            if c.get("fixture"):
                raise ValueError("Use fixture:false and a verified AOI for real remote terrain")
            # Request a small coverage margin for projected bounding rectangles.
            w, s, e, n = c["aoi"]["bbox"]
            b = [w - 0.025, s - 0.025, e + 0.025, n + 0.025]
            export_image(DEM_SERVICE, b, source_path(c, "dem"), 1024, True)
            export_image(NAIP_SERVICE, b, source_path(c, "imagery"), 2048)
        elif cmd == "fetch-landfire":
            w, s, e, n = c["aoi"]["bbox"]
            bbox = [w - 0.025, s - 0.025, e + 0.025, n + 0.025]
            download_wcs(args.endpoint, args.coverage, bbox, source_path(c, args.layer))
        elif cmd == "prepare-terrain":
            terrain(c)
        elif cmd == "ingest":
            ingest(c, args.input, args.source)
        elif cmd == "normalize":
            normalize_world(c)
        elif cmd == "enrich":
            enrich_world(c)
        elif cmd == "dedupe":
            dedupe_world(c)
        elif cmd == "protect":
            protect_world(c)
        elif cmd == "build-world":
            build_world(c)
        elif cmd == "db-sync":
            database.sync(c)
        elif cmd == "all":
            if c.get("fixture"):
                generate(c)
            ingest(c, args.input, args.source)
            normalize_world(c)
            enrich_world(c)
            dedupe_world(c)
            protect_world(c)
            build_world(c)
            if args.database:
                database.sync(c)
    except (ValueError, OSError, KeyError, httpx.HTTPError) as e:
        print(f"Wildscape: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
