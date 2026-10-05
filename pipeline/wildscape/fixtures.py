import json
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
from pyproj import Transformer
from PIL import Image, ImageDraw
from wildscape.config import ROOT
from wildscape.region.aoi import local_crs

TAXA = [
    ("Gopherus agassizii", "Desert tortoise", "Reptilia", "Animalia"),
    ("Coleogyne ramosissima", "Blackbrush", "Magnoliopsida", "Plantae"),
    ("Ephedra nevadensis", "Nevada ephedra", "Gnetopsida", "Plantae"),
    ("Yucca schidigera", "Mojave yucca", "Liliopsida", "Plantae"),
    ("Yucca brevifolia", "Joshua tree", "Liliopsida", "Plantae"),
    ("Sauromalus ater", "Chuckwalla", "Reptilia", "Animalia"),
    ("Eremophila alpestris", "Horned lark", "Aves", "Animalia"),
    ("Lepus californicus", "Black-tailed jackrabbit", "Mammalia", "Animalia"),
    ("Crotalus cerastes", "Sidewinder", "Reptilia", "Animalia"),
    ("Eriogonum fasciculatum", "California buckwheat", "Magnoliopsida", "Plantae"),
    ("Callipepla gambelii", "Gambel’s quail", "Aves", "Animalia"),
    ("Pepsis grossa", "Tarantula hawk", "Insecta", "Animalia"),
]


def generate(config):
    """Synthetic test landscape and evidence; never labeled as remotely observed data."""
    folder = ROOT / "fixtures" / "terrain"
    folder.mkdir(parents=True, exist_ok=True)
    crs = local_crs(config["aoi"]["bbox"])
    w, s, e, n = transform_bounds(4326, crs, *config["aoi"]["bbox"])
    # Source covers the projected output's perimeter with a margin.
    bounds = (w - 1500, s - 1500, e + 1500, n + 1500)
    size = 513
    x, y = np.meshgrid(np.linspace(-1, 1, size), np.linspace(1, -1, size))
    rng = np.random.default_rng(10820)
    ridge = np.exp(-(((x + 0.28 + 0.14 * np.sin(y * 4)) / 0.28) ** 2)) * np.exp(-((y / 0.95) ** 6))
    ridge2 = np.exp(-(((x - 0.52 - 0.10 * np.cos(y * 5)) / 0.20) ** 2)) * np.exp(-(((y - 0.2) / 0.7) ** 4))
    folds = (np.sin(18 * y + 10 * x) + 0.45 * np.sin(37 * y - 9 * x)) * 0.5 + 0.5
    dem = 720 + 720 * ridge + 390 * ridge2 + 95 * (1 + y) + 95 * ridge * folds + 25 * np.sin(x * 9 + y * 8)

    def save(name, data):
        if data.ndim == 2:
            data = data[None, :, :]
        with rasterio.open(
            folder / f"{name}.tif",
            "w",
            driver="GTiff",
            height=size,
            width=size,
            count=len(data),
            dtype=data.dtype,
            crs=crs,
            transform=from_bounds(*bounds, size, size),
            compress="deflate",
            nodata=-9999 if data.dtype.kind == "f" else None,
        ) as ds:
            ds.write(data)
            ds.update_tags(source="Wildscape synthetic fixture", license="CC0", fixture="true")

    save("dem", dem.astype("float32"))
    noise = rng.normal(0, 8, (size, size))
    wash = np.exp(-(((np.sin(y * 5) * 0.10 + x - 0.07) / 0.025) ** 2))
    cover = np.clip(12 + 18 * ridge - 5 * wash + 5 * np.sin(9 * x) * np.sin(y * 7), 4, 45)
    shade = np.clip(1 - 0.8 * np.gradient(dem)[1] / 20, 0.65, 1.2)
    colors = np.stack(
        [173 + 17 * wash - 20 * ridge, 153 + 17 * wash - 15 * ridge, 124 + 18 * wash - 8 * ridge]
    )
    rgb = np.clip(colors * shade[None, :, :] + noise[None, :, :] - cover[None, :, :] * 0.3, 0, 255).astype(
        "uint8"
    )
    save("imagery", rgb)
    save("bps", np.full((size, size), 10820, dtype="float32"))
    save("evt", np.full((size, size), 1, dtype="float32"))
    save("evc", cover.astype("float32"))
    save("evh", (0.5 + ridge * 1.2).astype("float32"))
    t = Transformer.from_crs(crs, 4326, always_xy=True)
    records = []
    for i in range(180):
        taxon = i % len(TAXA)
        name, common, klass, kingdom = TAXA[taxon]
        # Deterministic spatial clusters exercise far/medium/local reveal.
        cx, cy = [(-0.3, 0.25), (0.3, -0.25), (0.1, 0.35), (-0.25, -0.4)][i % 4]
        px = np.clip(rng.normal(cx, 0.19), -0.8, 0.8)
        py = np.clip(rng.normal(cy, 0.20), -0.8, 0.8)
        lon, lat = t.transform((w + e) / 2 + px * (e - w) / 2, (s + n) / 2 + py * (n - s) / 2)
        records.append(
            {
                "key": f"fixture-observation-{i + 1}",
                "speciesKey": f"fixture-{taxon + 1}",
                "scientificName": name,
                "species": name,
                "vernacularName": common,
                "taxonRank": "SPECIES",
                "class": klass,
                "kingdom": kingdom,
                "decimalLongitude": lon,
                "decimalLatitude": lat,
                "eventDate": f"{2010 + i % 15}-{1 + i % 12:02d}-{1 + i % 27:02d}",
                "basisOfRecord": "HUMAN_OBSERVATION",
                "datasetKey": "wildscape-synthetic-v1",
                "license": "CC0",
                "coordinateUncertaintyInMeters": 30,
                "occurrenceID": f"urn:wildscape:fixture:{i}",
                "is_sensitive": taxon == 0,
                "fixture": True,
            }
        )
    records[3]["eventDate"] = "1964-04-12"
    records[3]["basisOfRecord"] = "PRESERVED_SPECIMEN"
    records[5]["geoprivacy"] = "obscured"
    records[5]["coordinateUncertaintyInMeters"] = 10000
    records.append(dict(records[20]))
    # A data visualization swatch is an original licensed fixture media item, not a species photograph.
    image = Image.fromarray(rgb.transpose(1, 2, 0)).resize((640, 400))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 330, 640, 400), fill="#17201f")
    draw.text((20, 350), "SYNTHETIC HABITAT TEXTURE / NOT A SPECIES PHOTOGRAPH", fill="#eeeecc")
    image.save(folder / "fixture-habitat.webp", quality=88)
    records[1]["media"] = [
        {
            "identifier": f"/worlds/{config['id']}/species/media/fixture-habitat.webp",
            "creator": "Wildscape fixture generator",
            "license": "CC0",
            "attribution": "Wildscape synthetic habitat texture · CC0 · not a species photograph",
        }
    ]
    out = ROOT / "fixtures" / "biodiversity"
    out.mkdir(parents=True, exist_ok=True)
    (out / "records.json").write_text(json.dumps(records, indent=2))
    (ROOT / "fixtures" / "README.md").write_text(
        "All rasters and occurrence records here are deterministic synthetic tests. Coordinates are a test footprint, not a verified BpS location. Taxon labels exercise the field guide; no occurrence is a biological claim. CC0.\n"
    )
