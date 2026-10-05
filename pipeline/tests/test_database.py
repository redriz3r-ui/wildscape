import os
import pytest
import psycopg
from wildscape import database

pytestmark = pytest.mark.skipif(
    os.getenv("WILDSCAPE_DB_TEST") != "1", reason="Enable WILDSCAPE_DB_TEST=1 with make db-up"
)


def test_postgis_ingestion_and_raw_immutability(built):
    database.sync(built)
    database.sync(built)
    with database.connect() as connection:
        assert connection.execute("SELECT PostGIS_Version()").fetchone()[0]
        assert (
            connection.execute(
                "SELECT count(*) FROM region_occurrences WHERE region_id=%s", (built["id"],)
            ).fetchone()[0]
            == 180
        )
        assert (
            connection.execute(
                "SELECT count(*) FROM occurrences WHERE is_sensitive AND NOT ST_Equals(precise_geom,public_geom)"
            ).fetchone()[0]
            > 0
        )
        with pytest.raises(psycopg.Error, match="immutable"):
            connection.execute(
                "UPDATE raw_records SET source_id='altered' WHERE id=(SELECT min(id) FROM raw_records)"
            )
