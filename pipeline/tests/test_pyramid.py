import io
from types import SimpleNamespace
from PIL import Image
from wildscape.terrain.pyramid import fetch_pyramid


def test_projected_pyramid_preserves_north_south_and_pixel_spacing(tmp_path, monkeypatch):
    image = Image.new("RGB", (1024, 1024), "blue")
    image.paste("red", (0, 0, 1024, 512))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=100)
    meta = {"grid_bounds": [0, 0, 1024, 1024], "crs": "EPSG:32611"}

    def request(url, params=None):
        if params:
            return SimpleNamespace(
                json=lambda: {
                    "href": "https://example.test/tile.jpg",
                    "extent": dict(xmin=0, ymin=0, xmax=1024, ymax=1024),
                }
            )
        return SimpleNamespace(content=buffer.getvalue())

    monkeypatch.setattr("wildscape.terrain.pyramid.request", request)
    result = fetch_pyramid(meta, tmp_path, max_level=1)
    assert result["meters_per_pixel"] == 1
    with Image.open(tmp_path / "1/0/0.webp") as north:
        assert north.getpixel((256, 256))[0] > 240
    with Image.open(tmp_path / "1/0/1.webp") as south:
        assert south.getpixel((256, 256))[2] > 240
    assert len(list(tmp_path.glob("*/*/*.webp"))) == 5
