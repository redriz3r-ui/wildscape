import json
import pytest
from wildscape.config import ROOT, load_world
from wildscape.fixtures import generate
from wildscape.biodiversity.ingest import ingest
from wildscape.build.world import normalize_world, dedupe_world, protect_world, build_world


@pytest.fixture(scope="session")
def built():
    c = load_world("mojave-fixture")
    generate(c)
    ingest(c)
    normalize_world(c)
    dedupe_world(c)
    protect_world(c)
    build_world(c)
    return c


@pytest.fixture
def raw(built):
    return json.loads((ROOT / "fixtures/biodiversity/records.json").read_text())[1]
