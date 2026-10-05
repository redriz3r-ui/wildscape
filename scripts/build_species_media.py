"""Build a commercially reusable, attributed taxon-photo pack for screening.

Only exact scientific-name matches and CC0/CC BY photographs are accepted.
Photos illustrate taxa; they are not observations from the Wildscape project.
"""

import io
import json
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from PIL import Image, ImageOps, UnidentifiedImageError
from wildscape.config import ROOT

WORLD = "mojave-001"
SOURCE = ROOT / "public" / "worlds" / WORLD / "species" / "index.json"
PACK = ROOT / "public" / "screening" / WORLD / "pack.json"
OUT = ROOT / "public" / "screening" / WORLD
CACHE = ROOT / "data_generated" / f"{WORLD}-media-search.json"
USER_AGENT = "WildscapePrototype/1.0 (local ecological screening)"
ALLOWED = {"cc0": "CC0", "cc-by": "CC BY"}
HOST = "inaturalist-open-data.s3.amazonaws.com"


def fetch(url, timeout=20):
    with urlopen(
        Request(url, headers={"User-Agent": USER_AGENT}), timeout=timeout
    ) as response:
        return response.read()


def photo_from_existing(species):
    for item in species.get("media", []):
        license_name = str(item.get("license", "")).upper().replace("-", " ")
        if license_name not in {"CC0", "CC BY"}:
            continue
        url = item.get("thumbnail_url") or item.get("url", "")
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != HOST:
            continue
        source = item.get("source", "")
        if not source.startswith("https://www.inaturalist.org/photos/"):
            continue
        return {
            "url": url.replace("/original.", "/medium."),
            "source": source,
            "credit": item.get("attribution")
            or item.get("creator")
            or "Unknown creator",
            "license": license_name,
            "provider": "iNaturalist",
            "match": "existing curated photo",
        }
    return None


def photo_from_observations(name):
    query = urlencode(
        {
            "taxon_name": name,
            "photos": "true",
            "photo_license": "cc0,cc-by",
            "quality_grade": "research",
            "per_page": 20,
            "order_by": "observed_on",
            "order": "desc",
        }
    )
    data = json.loads(fetch(f"https://api.inaturalist.org/v1/observations?{query}"))
    for observation in data.get("results", []):
        taxon = observation.get("taxon") or {}
        if taxon.get("name", "").casefold() != name.casefold():
            continue
        if taxon.get("rank") not in {"species", "subspecies", "variety"}:
            continue
        for photo in observation.get("photos", []):
            license_name = ALLOWED.get(photo.get("license_code"))
            url = photo.get("url", "")
            parsed = urlparse(url)
            if not license_name or parsed.scheme != "https" or parsed.hostname != HOST:
                continue
            if not photo.get("attribution") or not isinstance(photo.get("id"), int):
                continue
            return {
                "url": url.replace("/square.", "/medium."),
                "source": f"https://www.inaturalist.org/photos/{photo['id']}",
                "credit": photo["attribution"],
                "license": license_name,
                "provider": "iNaturalist",
                "match": "exact accepted taxon name; reference photo from another observation",
            }
    return None


def save_photo(taxon_id, photo):
    destination = OUT / "media" / f"{taxon_id}.webp"
    if destination.is_file():
        return f"media/{taxon_id}.webp"
    raw = fetch(photo["url"], timeout=25)
    if len(raw) > 8_000_000:
        raise ValueError("Photo exceeds 8 MB")
    with Image.open(io.BytesIO(raw)) as image:
        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError("Unexpected image format")
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((500, 500), Image.Resampling.LANCZOS)
        if min(image.size) < 80:
            raise ValueError("Photo too small")
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=82, method=5)
    return f"media/{taxon_id}.webp"


def build():
    pack = json.loads(PACK.read_text())
    allowed_taxa = {r["taxon_id"] for r in pack["records"]}
    species = [s for s in json.loads(SOURCE.read_text()) if s["id"] in allowed_taxa]
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    result = {}
    next_request_at = time.monotonic()
    for position, taxon in enumerate(species, 1):
        taxon_id, name = taxon["id"], taxon["name"]
        photo = (
            cache.get(taxon_id, {}).get("photo")
            if taxon_id in cache
            else photo_from_existing(taxon)
        )
        if taxon_id not in cache and not photo:
            time.sleep(max(0, next_request_at - time.monotonic()))
            next_request_at = (
                time.monotonic() + 1.25
            )  # <=48 iNaturalist API requests/minute.
            for attempt in range(3):
                try:
                    photo = photo_from_observations(name)
                    break
                except (
                    HTTPError,
                    URLError,
                    TimeoutError,
                    OSError,
                    ValueError,
                ) as error:  # transient API/network failure
                    if attempt == 2:
                        print(
                            f"{position}/{len(species)} {name}: query failed: {error}",
                            flush=True,
                        )
                    else:
                        time.sleep(2**attempt)
            if attempt == 2 and not photo:
                continue  # A failed lookup is not cached as a species with no photo.
        if taxon_id not in cache:
            cache[taxon_id] = {"name": name, "photo": photo}
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2))
        if photo:
            try:
                asset = save_photo(taxon_id, photo)
                result[taxon_id] = {
                    "name": name,
                    "image": asset,
                    **{k: v for k, v in photo.items() if k != "url"},
                }
            except (
                HTTPError,
                URLError,
                TimeoutError,
                OSError,
                ValueError,
                UnidentifiedImageError,
            ) as error:
                print(
                    f"{position}/{len(species)} {name}: image failed: {error}",
                    flush=True,
                )
        if position % 10 == 0:
            print(
                f"{position}/{len(species)} taxa checked · {len(result)} licensed images",
                flush=True,
            )
    manifest = {
        "schema": 1,
        "world": WORLD,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "license_policy": "CC0 and CC BY only; exact scientific-name match or previously curated taxon photo",
        "note": "Reference photos depict the taxon, not this project or its occurrence locations. Copies resized to <=500 px and encoded as WebP.",
        "photos": result,
    }
    (OUT / "media.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(
        f"Wrote {len(result)} photos for {len(species)} licensed-record taxa",
        flush=True,
    )


if __name__ == "__main__":
    build()
