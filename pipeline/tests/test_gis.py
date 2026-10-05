import json
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from wildscape.config import ROOT, load_world
from wildscape.terrain.dem import inspect_dem, geo_to_scene, scene_to_geo, sample
from wildscape.region.aoi import find_candidates


@pytest.fixture
def terrain(built):
    folder = ROOT / "public/worlds/mojave-fixture/terrain"
    meta = json.loads((folder / "metadata.json").read_text())
    data = np.fromfile(folder / "elevation/high.bin", dtype="<f4").reshape(meta["size"], meta["size"])
    return data, meta


def test_dem_metadata_and_footprint(built):
    meta = inspect_dem(ROOT / "fixtures/terrain/dem.tif")
    assert meta["original_crs"] == "EPSG:32611"
    w, s, e, n = meta["geographic_footprint"]
    assert w < built["aoi"]["bbox"][0] and e > built["aoi"]["bbox"][2]
    assert s < built["aoi"]["bbox"][1] and n > built["aoi"]["bbox"][3]


@pytest.mark.parametrize("lon,lat,z", [(-115.55, 35.32, 900), (-115.60, 35.28, 1400), (-115.50, 35.37, 1000)])
def test_coordinate_roundtrip(terrain, lon, lat, z):
    _, meta = terrain
    scene = geo_to_scene(lon, lat, z, meta)
    assert scene_to_geo(*scene, meta) == pytest.approx([lon, lat, z], abs=1e-8)


def test_elevation_sample_vertices_and_interpolation(terrain):
    data, m = terrain
    w, s, e, n = m["grid_bounds"]
    assert sample(data, m, w, n) == pytest.approx(float(data[0, 0]))
    assert sample(data, m, e, s) == pytest.approx(float(data[-1, -1]))
    assert sample(data, m, (w + e) / 2, (s + n) / 2) == pytest.approx(
        float(data[len(data) // 2, len(data) // 2])
    )
    assert sample(data, m, w - 1, n) is None


def test_crs_missing_fails(tmp_path):
    p = tmp_path / "missing.tif"
    with rasterio.open(
        p, "w", driver="GTiff", width=4, height=4, count=1, dtype="float32", transform=from_origin(0, 4, 1, 1)
    ) as ds:
        ds.write(np.ones((1, 4, 4), dtype="float32"))
    with pytest.raises(ValueError, match="no CRS"):
        inspect_dem(p)


def test_aoi_candidate_codes(built):
    candidates = find_candidates(ROOT / "fixtures/terrain/bps.tif", [10820], 10)
    assert candidates and candidates[0]["bps_coverage"] == 1
    assert not find_candidates(ROOT / "fixtures/terrain/bps.tif", [99999], 10)


def test_invalid_world_rejected(tmp_path):
    p = tmp_path / "world.yaml"
    p.write_text("id: bad\nname: Bad\naoi: {bbox: [5, 4, 1, 0]}\nterrain: {}")
    with pytest.raises(ValueError, match="bbox"):
        load_world(str(p))


def test_progressive_grid_preserves_endpoints_for_even_sizes(built, tmp_path):
    from wildscape.terrain.dem import prepare_dem

    data, meta = prepare_dem(ROOT / "fixtures/terrain/dem.tif", built["aoi"]["bbox"], tmp_path, 18)
    low = np.fromfile(tmp_path / "elevation/low.bin", dtype="<f4").reshape(meta["low_size"], meta["low_size"])
    assert low[0, 0] == data[0, 0]
    assert low[-1, -1] == data[-1, -1]


def test_vegetation_roots_follow_bilinear_terrain(built):
    import json
    import numpy as np
    from wildscape.terrain.dem import sample

    folder = ROOT / "public/worlds" / built["id"]
    meta = json.loads((folder / "terrain/metadata.json").read_text())
    data = np.fromfile(folder / "terrain/elevation/high.bin", dtype="<f4").reshape(meta["size"], meta["size"])
    placements = json.loads((folder / "vegetation/placement.json").read_text())
    ox, on, oz = meta["origin"]
    for _, x, y, z, *_ in placements[::37]:
        assert abs(y - (sample(data, meta, ox + x, on - z) - oz)) < 0.03
