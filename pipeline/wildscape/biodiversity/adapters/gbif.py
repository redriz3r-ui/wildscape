from wildscape.biodiversity.adapters.base import request


class GBIFAdapter:
    def records(self, config):
        params = {
            "geometry": config["_geometry"].wkt,
            "hasCoordinate": "true",
            "limit": 300,
            "eventDate": f"{config['biodiversity']['start_date']},*",
        }
        offset = 0
        while True:
            query = {**params, "offset": offset}
            data = request("https://api.gbif.org/v1/occurrence/search", query).json()
            if data.get("count", 0) > 100000:
                raise ValueError(
                    "GBIF search exceeds 100,000; request an official DOI download and import it"
                )
            for record in data.get("results", []):
                yield record, query
            if data.get("endOfRecords", True):
                break
            offset += len(data["results"])
            if not data["results"]:
                raise ValueError("GBIF returned an empty intermediate page")
