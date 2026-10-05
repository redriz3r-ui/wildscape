import pytest
import httpx
from wildscape.biodiversity.adapters.gbif import GBIFAdapter
from wildscape.biodiversity.adapters import gbif
from wildscape.vegetation.placement import decode
import numpy as np


def test_gbif_pagination(built, monkeypatch):
    calls = []

    def request(url, params):
        calls.append(params)
        return httpx.Response(
            200,
            json={
                "count": 2,
                "endOfRecords": params["offset"] > 0,
                "results": [{"key": params["offset"] + 1}],
            },
        )

    monkeypatch.setattr(gbif, "request", request)
    rows = list(GBIFAdapter().records(built))
    assert len(rows) == 2 and calls[1]["offset"] == 1 and "POLYGON" in calls[0]["geometry"]


def test_gbif_search_limit_not_silent(built, monkeypatch):
    monkeypatch.setattr(gbif, "request", lambda *args: httpx.Response(200, json={"count": 100001}))
    with pytest.raises(ValueError, match="DOI"):
        list(GBIFAdapter().records(built))


def test_landfire_codes_explicit():
    raster = np.array([[101, 102]])
    assert decode(raster, {101: 10, 102: 20}, "EVC").tolist() == [[10, 20]]
    with pytest.raises(ValueError, match="Unmapped"):
        decode(raster, {101: 10}, "EVC")
    with pytest.raises(ValueError, match="mapping"):
        decode(raster, {}, "EVC")
