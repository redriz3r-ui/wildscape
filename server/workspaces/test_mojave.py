from unittest.mock import patch

from django.core import signing
from django.core.cache import cache
from django.test import TestCase

from . import tests as workspace_tests
from .mojave import in_region, profile, vegetation


class PointTests(TestCase):
    def test_coverage_and_missing_sources(self):
        self.assertTrue(in_region(-116, 35))
        self.assertFalse(in_region(0, 0))
        with self.assertRaises(ValueError):
            profile(0, 0)
        with patch("workspaces.mojave.get_json", side_effect=ValueError("offline")):
            result = profile(-116, 35)
        self.assertTrue(all(s["status"] == "unavailable" for s in result["sources"].values()))
        self.assertNotIn("count", result["sources"]["occurrences"])

    def test_vegetation_uses_wgs84_and_actual_legend(self):
        with patch("workspaces.mojave.get_json", return_value={"value": "7087"}) as query:
            result = vegetation("EVT", -116, 35)
        self.assertIn("4326", query.call_args.args[1]["geometry"])
        self.assertNotEqual(result["label"], "Class label unavailable")
        self.assertEqual(result["resolutionM"], 30)


class SiteTests(TestCase):
    setUp = workspace_tests.WorkspaceTests.setUp
    post = workspace_tests.WorkspaceTests.post

    def test_signed_snapshot_and_workspace_access(self):
        cache.clear()
        snapshot = {"schema": 1, "longitude": -116, "latitude": 35, "sources": {}}
        endpoint = f"/api/workspaces/{self.org.pk}/sites/"
        with patch("workspaces.mojave.profile", return_value=snapshot):
            result = self.post("/api/mojave/point/", {"longitude": -116, "latitude": 35})
        token = result.json()["evidenceToken"]
        self.assertEqual(signing.loads(token, salt="mojave-evidence"), snapshot)
        self.assertEqual(
            self.post(endpoint, {"name": "Forged", "profile": snapshot}).status_code, 400
        )
        saved = self.post(endpoint, {"name": "Candidate", "evidenceToken": token})
        self.assertEqual(saved.status_code, 201, saved.content)
        self.assertEqual(saved.json()["profile"], snapshot)
        update = endpoint + saved.json()["id"] + "/"
        edited = {
            "name": "Candidate",
            "status": "Survey planned",
            "notes": "Verify access",
            "version": 1,
        }
        self.assertEqual(self.post(update, edited).status_code, 200)
        self.assertEqual(self.post(update, edited).status_code, 409)
        history_url = update + "revisions/"
        history = self.client.get(history_url).json()["revisions"]
        self.assertEqual([r["version"] for r in history], [2, 1])
        self.assertEqual(history[0]["notes"], "Verify access")
        self.assertEqual(history[1]["notes"], "")
        self.assertEqual(history[1]["status"], "To review")
        self.assertEqual(history[0]["actor"], self.owner.email)
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(history_url).status_code, 200)
        self.assertEqual(self.post(update, {**edited, "version": 2}).status_code, 403)
        self.assertEqual(self.client.get(endpoint).status_code, 200)
        self.assertEqual(
            self.post(endpoint, {"name": "Denied", "evidenceToken": token}).status_code, 403
        )
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(endpoint).status_code, 403)
        self.assertEqual(self.client.get(history_url).status_code, 403)


class RecordAreaTests(TestCase):
    def test_ranked_broad_counts_without_occurrence_locations(self):
        from .mojave import record_areas

        def source(url, params):
            self.assertEqual(params["limit"], 0)
            self.assertEqual(params["license"], ["CC0_1_0", "CC_BY_4_0"])
            self.assertNotIn("offset", params)
            west = float(params["decimalLongitude"].split(",")[0])
            return {"count": int((west + 120) * 100)}

        with patch("workspaces.mojave.get_json", side_effect=source):
            result = record_areas(-116, 35, 25)
        self.assertEqual(result["status"], "complete")
        self.assertGreater(len(result["areas"]), 0)
        self.assertLessEqual(len(result["areas"]), 16)
        self.assertEqual(
            [a["count"] for a in result["areas"]],
            sorted([a["count"] for a in result["areas"]], reverse=True),
        )
        self.assertFalse(any("coordinates" in a for a in result["areas"]))

    def test_source_failures_are_not_zero_counts(self):
        from .mojave import record_areas

        with patch("workspaces.mojave.get_json", side_effect=ValueError("upstream down")):
            result = record_areas(-116, 35, 50)
        self.assertEqual(result["status"], "partial")
        self.assertTrue(
            all(a["status"] == "unavailable" and a["count"] is None for a in result["areas"])
        )

    def test_endpoint_validation_and_cached_repeat(self):
        from django.core.cache import cache

        cache.clear()
        url = "/api/mojave/record-areas/"
        self.assertEqual(
            self.client.post(
                url, data='{"longitude":0,"latitude":0}', content_type="application/json"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                url,
                data='{"longitude":-116,"latitude":35,"cellSizeKm":1}',
                content_type="application/json",
            ).status_code,
            400,
        )
        synthetic = {"status": "complete", "areas": [], "cellSizeKm": 25}
        with patch("workspaces.mojave.record_areas", return_value=synthetic) as scan:
            first = self.client.post(
                url,
                data='{"longitude":-116,"latitude":35,"cellSizeKm":25}',
                content_type="application/json",
            )
            second = self.client.post(
                url,
                data='{"longitude":-116,"latitude":35,"cellSizeKm":25}',
                content_type="application/json",
            )
        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.json()["cached"])
        self.assertTrue(second.json()["cached"])
        scan.assert_called_once()
