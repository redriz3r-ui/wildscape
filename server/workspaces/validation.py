import math
import uuid
from datetime import date

from django.core.exceptions import ValidationError

DECISIONS = {
    "Unreviewed",
    "Further assessment",
    "Survey recommended",
    "Retain for screening",
    "Screened out",
}


def validate_project(data):
    def fail(message):
        raise ValidationError(message)

    if not isinstance(data, dict) or data.get("schema") != 1 or data.get("world") != "mojave-001":
        fail("Unsupported project schema or regional pack")
    try:
        uuid.UUID(data.get("id", ""))
    except (ValueError, TypeError, AttributeError):
        fail("Invalid project identifier")
    for key in (
        "name",
        "client",
        "reference",
        "purpose",
        "since",
        "created",
        "updated",
        "notes",
        "reviewer",
        "agencyNotes",
    ):
        if not isinstance(data.get(key), str) or len(data[key]) > 50000:
            fail(f"Invalid {key}")
    if not data["name"].strip() or len(data["name"]) > 250:
        fail("Project name must contain 1–250 characters")
    if data["since"]:
        try:
            date.fromisoformat(data["since"])
        except ValueError:
            fail("Invalid earliest occurrence date")
    if type(data.get("revision")) is not int or data["revision"] < 1:
        fail("Invalid project revision")
    for key in ("example", "habitatChecked", "agencyChecked"):
        if type(data.get(key)) is not bool:
            fail(f"Invalid {key}")
    if data.get("status") not in {"Draft", "Reviewed"}:
        fail("Invalid review status")
    if type(data.get("buffer")) not in (int, float) or not 0 <= data["buffer"] <= 10000:
        fail("Invalid search distance")

    def point(p):
        if (
            not isinstance(p, list)
            or len(p) != 2
            or any(type(n) not in (int, float) or not math.isfinite(n) for n in p)
            or not (-180 <= p[0] <= 180 and -90 <= p[1] <= 90)
        ):
            fail("Geometry requires finite WGS84 longitude/latitude pairs")

    def geometry(g, only_polygon=False):
        if not isinstance(g, dict):
            fail("Invalid geometry")
        coords = g.get("coordinates")
        kind = g.get("type")
        if not isinstance(coords, list) or (only_polygon and kind != "Polygon"):
            fail("Invalid geometry coordinates")
        if kind == "Point":
            point(coords)
        elif kind == "LineString":
            if len(coords) < 2:
                fail("Survey line needs two points")
            for p in coords:
                point(p)
        elif kind == "Polygon":
            if not coords:
                fail("Polygon needs a ring")
            for ring in coords:
                if not isinstance(ring, list) or len(ring) < 4 or ring[0] != ring[-1]:
                    fail("Polygon rings must be closed")
                for p in ring:
                    point(p)
        else:
            fail("Unsupported geometry")

    if data.get("aoi") is not None:
        geometry(data["aoi"], True)
    for key in ("field", "candidates", "history"):
        if not isinstance(data.get(key), list) or len(data[key]) > 10000:
            fail(f"Invalid {key} list")
    for f in data["field"]:
        if not isinstance(f, dict) or any(
            not isinstance(f.get(k), str)
            for k in (
                "id",
                "name",
                "date",
                "observer",
                "kind",
                "method",
                "effort",
                "notes",
                "photo",
            )
        ):
            fail("Invalid field evidence attributes")
        if (
            not f["name"].strip()
            or not f["observer"].strip()
            or type(f.get("sensitive")) is not bool
        ):
            fail("Field evidence requires name, observer and sensitivity")
        try:
            date.fromisoformat(f["date"])
        except ValueError:
            fail("Invalid observation date")
        geometry(f.get("geometry"))
        if f["geometry"]["type"] != "Point" and (
            not f["method"].strip() or not f["effort"].strip()
        ):
            fail("Survey geometry requires method and effort")
    for c in data["candidates"]:
        if (
            not isinstance(c, dict)
            or any(
                not isinstance(c.get(k), str)
                for k in (
                    "id",
                    "name",
                    "common",
                    "group",
                    "reason",
                    "habitat",
                    "source",
                    "sourceTitle",
                )
            )
            or not c["name"]
            or not c["reason"]
            or not c["source"].startswith(("https://", "http://"))
        ):
            fail("Candidate requires named, cited evidence")
    if not isinstance(data.get("reviews"), dict):
        fail("Invalid species reviews")
    for r in data["reviews"].values():
        if (
            not isinstance(r, dict)
            or r.get("decision") not in DECISIONS
            or any(
                not isinstance(r.get(k), str)
                for k in ("rationale", "reviewer", "action", "updated")
            )
        ):
            fail("Invalid review attributes")
        if r["decision"] != "Unreviewed" and (
            not r["rationale"].strip() or not r["reviewer"].strip()
        ):
            fail("Review requires rationale and reviewer")
        if (
            r["decision"] in {"Survey recommended", "Further assessment"}
            and not r["action"].strip()
        ):
            fail("Review requires a next action")
    if data["status"] == "Reviewed" and (
        not data.get("aoi")
        or not data["habitatChecked"]
        or not data["agencyChecked"]
        or not data["reviewer"].strip()
        or not data["agencyNotes"].strip()
        or not data["notes"].strip()
        or data.get("reviewedRevision") != data["revision"]
        or any(r["decision"] == "Unreviewed" for r in data["reviews"].values())
    ):
        fail("Review gates are incomplete")
    return data
