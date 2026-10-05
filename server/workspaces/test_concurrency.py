"""Real two-connection races; skipped explicitly on SQLite."""

import json
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest import skipUnless

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import close_old_connections, connection, connections
from django.test import Client, TransactionTestCase

from .models import Membership, Organization, Project, Revision, SurveySite, SurveySiteRevision
from .tests import sample_project


@skipUnless(connection.vendor == "postgresql", "Requires PostgreSQL row locking")
class ConcurrentSaveTests(TransactionTestCase):
    def setUp(self):
        self.owner = get_user_model().objects.create_user(
            "race@example.test", email="race@example.test", password="Synthetic-race-password!8"
        )
        self.org = Organization.objects.create(name="Synthetic concurrency test")
        Membership.objects.create(organization=self.org, user=self.owner, role="owner")
        self.clients = [Client(), Client()]
        for client in self.clients:
            client.force_login(self.owner)

    def race(self, method, url, payloads):
        gate = Barrier(2)

        def send(i):
            close_old_connections()
            try:
                gate.wait(timeout=10)
                response = getattr(self.clients[i], method)(
                    url, data=json.dumps(payloads[i]), content_type="application/json"
                )
                return response.status_code
            finally:
                connections.close_all()

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(send, range(2)))
        self.assertEqual(sorted(outcomes), [200, 409])
        return outcomes.index(200)

    def test_project_race_preserves_one_winner_and_revision(self):
        data = sample_project()
        endpoint = f"/api/workspaces/{self.org.pk}/projects/"
        response = self.clients[0].post(
            endpoint, data=json.dumps({"data": data}), content_type="application/json"
        )
        self.assertEqual(response.status_code, 201)
        row = response.json()
        versions = [{**data, "id": row["id"], "name": f"Editor {i}"} for i in range(2)]
        winner = self.race(
            "put", endpoint + row["id"] + "/", [{"version": 1, "data": d} for d in versions]
        )
        stored = Project.objects.get(pk=row["id"])
        self.assertEqual(stored.name, f"Editor {winner}")
        self.assertEqual(stored.version, 2)
        self.assertEqual(Revision.objects.filter(project=stored).count(), 2)
        self.assertEqual(Revision.objects.get(project=stored, version=2).data, stored.data)

    def test_site_race_preserves_one_winner_and_history(self):
        snapshot = {"schema": 1, "longitude": -116, "latitude": 35, "sources": {}}
        endpoint = f"/api/workspaces/{self.org.pk}/sites/"
        response = self.clients[0].post(
            endpoint,
            data=json.dumps(
                {
                    "name": "Synthetic site",
                    "evidenceToken": signing.dumps(snapshot, salt="mojave-evidence"),
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        row = response.json()
        winner = self.race(
            "post",
            endpoint + row["id"] + "/",
            [
                {
                    "name": "Synthetic site",
                    "version": 1,
                    "status": "Survey planned",
                    "notes": f"Reviewer {i}",
                }
                for i in range(2)
            ],
        )
        stored = SurveySite.objects.get(pk=row["id"])
        self.assertEqual(stored.notes, f"Reviewer {winner}")
        self.assertEqual(stored.version, 2)
        self.assertEqual(SurveySiteRevision.objects.filter(site=stored).count(), 2)
        self.assertEqual(SurveySiteRevision.objects.get(site=stored, version=2).notes, stored.notes)
