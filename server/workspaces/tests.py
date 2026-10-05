import json
import uuid

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from .models import AuditEvent, Membership, Organization, Project, Revision


def sample_project():
    return {
        "schema": 1,
        "id": str(uuid.uuid4()),
        "name": "Desert pilot",
        "client": "Client",
        "reference": "P-001",
        "purpose": "Screening",
        "world": "mojave-001",
        "aoi": None,
        "buffer": 1000,
        "since": "",
        "example": False,
        "created": "2026-10-04T00:00:00Z",
        "updated": "2026-10-04T00:00:00Z",
        "revision": 1,
        "candidates": [],
        "reviews": {},
        "field": [],
        "notes": "",
        "reviewer": "",
        "agencyNotes": "",
        "habitatChecked": False,
        "agencyChecked": False,
        "status": "Draft",
        "history": [],
    }


class WorkspaceTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(
            "owner@example.test",
            email="owner@example.test",
            password="Long-unique-test-password!7",
        )
        self.viewer = User.objects.create_user(
            "viewer@example.test",
            email="viewer@example.test",
            password="Long-unique-test-password!7",
        )
        self.outsider = User.objects.create_user(
            "other@example.test",
            email="other@example.test",
            password="Long-unique-test-password!7",
        )
        self.org = Organization.objects.create(name="Desert consultancy")
        self.other = Organization.objects.create(name="Other consultancy")
        Membership.objects.create(organization=self.org, user=self.owner, role="owner")
        Membership.objects.create(organization=self.org, user=self.viewer, role="viewer")
        Membership.objects.create(organization=self.other, user=self.outsider, role="owner")
        self.base = f"/api/workspaces/{self.org.pk}/projects/"
        self.client.force_login(self.owner)

    def post(self, url, data, method="post", client=None):
        return getattr(client or self.client, method)(
            url, data=json.dumps(data), content_type="application/json"
        )

    def create(self):
        result = self.post(self.base, {"data": sample_project()})
        self.assertEqual(result.status_code, 201, result.content)
        return result.json()

    def test_authentication_and_tenant_isolation(self):
        row = self.create()
        self.client.logout()
        self.assertEqual(self.client.get(self.base).status_code, 401)
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.base).status_code, 403)
        other_base = f"/api/workspaces/{self.other.pk}/projects/"
        self.assertEqual(self.client.get(other_base + row["id"] + "/").status_code, 404)
        self.assertEqual(self.client.get(other_base).json()["projects"], [])

    def test_viewer_cannot_mutate_or_invite(self):
        row = self.create()
        self.client.force_login(self.viewer)
        self.assertEqual(self.client.get(self.base).status_code, 200)
        self.assertEqual(self.post(self.base, {"data": sample_project()}).status_code, 403)
        self.assertEqual(
            self.post(
                self.base + row["id"] + "/", {"data": row["data"], "version": 1}, "put"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.post(
                f"/api/workspaces/{self.org.pk}/invitations/",
                {"email": "test@example.test"},
            ).status_code,
            403,
        )

    def test_conflict_preserves_newer_version_and_audit(self):
        row = self.create()
        row["data"]["name"] = "Biologist A edit"
        url = self.base + row["id"] + "/"
        saved = self.post(url, {"data": row["data"], "version": 1}, "put")
        self.assertEqual(saved.status_code, 200)
        row["data"]["name"] = "Stale biologist B edit"
        self.assertEqual(
            self.post(url, {"data": row["data"], "version": 1}, "put").status_code, 409
        )
        self.assertEqual(Project.objects.get(pk=row["id"]).name, "Biologist A edit")
        self.assertEqual(Revision.objects.count(), 2)
        self.assertEqual(AuditEvent.objects.count(), 2)
        self.assertEqual(Revision.objects.get(version=1).data["name"], "Desert pilot")

    def test_server_rejects_malformed_and_false_review_completion(self):
        data = sample_project()
        data["buffer"] = -5
        self.assertEqual(self.post(self.base, {"data": data}).status_code, 400)
        data["buffer"] = 1000
        data["status"] = "Reviewed"
        self.assertEqual(self.post(self.base, {"data": data}).status_code, 400)
        self.assertEqual(Project.objects.count(), 0)

    def test_csrf_is_required_and_session_logout_revokes_access(self):
        browser = Client(enforce_csrf_checks=True)
        self.assertEqual(
            self.post(
                "/api/login/",
                {"email": self.owner.email, "password": "Long-unique-test-password!7"},
                client=browser,
            ).status_code,
            403,
        )
        token = browser.get("/api/session/").json()["csrfToken"]
        result = browser.post(
            "/api/login/",
            data=json.dumps({"email": self.owner.email, "password": "Long-unique-test-password!7"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(result.status_code, 200)
        self.assertTrue(browser.cookies["sessionid"]["httponly"])
        self.assertEqual(browser.get(self.base).status_code, 200)
        self.assertEqual(
            browser.post(
                "/api/logout/",
                data="{}",
                content_type="application/json",
                HTTP_X_CSRFTOKEN=result.json()["csrfToken"],
            ).status_code,
            200,
        )
        self.assertEqual(browser.get(self.base).status_code, 401)

    def test_invitation_is_scoped_single_use_and_password_validated(self):
        result = self.post(
            f"/api/workspaces/{self.org.pk}/invitations/",
            {"email": "new@example.test", "role": "editor"},
        )
        self.assertEqual(result.status_code, 201)
        token = result.json()["invitationToken"]
        self.client.logout()
        self.assertEqual(
            self.post(
                "/api/invitations/accept/", {"token": token, "password": "short"}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                "/api/invitations/accept/",
                {"token": token, "password": "Invitation-unique-password!9"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.post(
                "/api/invitations/accept/",
                {"token": token, "password": "Invitation-unique-password!9"},
            ).status_code,
            400,
        )
        self.assertEqual(
            Membership.objects.get(user__email="new@example.test").organization_id,
            self.org.pk,
        )

    def test_existing_account_invite_cannot_take_over_account(self):
        result = self.post(
            f"/api/workspaces/{self.org.pk}/invitations/",
            {"email": self.outsider.email, "role": "editor"},
        )
        self.client.logout()
        self.assertEqual(
            self.post(
                "/api/invitations/accept/",
                {
                    "token": result.json()["invitationToken"],
                    "password": "Different-password!9",
                },
            ).status_code,
            401,
        )
        self.assertEqual(
            Membership.objects.filter(user=self.outsider, organization=self.org).count(),
            0,
        )

    def test_duplicate_project_id_never_overwrites(self):
        row = self.create()
        self.assertEqual(self.post(self.base, {"data": row["data"]}).status_code, 409)
        self.assertEqual(Project.objects.count(), 1)

    def test_login_throttle(self):
        self.client.logout()
        for _ in range(10):
            self.assertEqual(
                self.post(
                    "/api/login/", {"email": self.owner.email, "password": "wrong"}
                ).status_code,
                401,
            )
        self.assertEqual(
            self.post("/api/login/", {"email": self.owner.email, "password": "wrong"}).status_code,
            429,
        )

    def test_account_recovery_is_single_use_and_revokes_previous_session(self):
        import re

        from django.core import mail

        old_session = Client()
        old_session.force_login(self.owner)
        with self.settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
            self.client.logout()
            self.assertEqual(
                self.post("/api/password/request-reset/", {"email": self.owner.email}).status_code,
                200,
            )
            self.assertEqual(len(mail.outbox), 1)
            token = re.search(r"#reset=([^\s]+)", mail.outbox[0].body).group(1)
            self.assertEqual(
                self.post(
                    "/api/password/reset/",
                    {"token": token, "password": "New-private-password!8"},
                ).status_code,
                200,
            )
            self.assertEqual(
                self.post(
                    "/api/password/reset/",
                    {"token": token, "password": "New-private-password!8"},
                ).status_code,
                400,
            )
            self.assertEqual(old_session.get(self.base).status_code, 401)
            self.assertEqual(
                self.post("/api/password/request-reset/", {"email": "absent@example.test"}).json(),
                {"ok": True},
            )
            self.assertEqual(len(mail.outbox), 1)

    def test_archive_restore_is_reversible_and_versioned(self):
        row = self.create()
        url = self.base + row["id"] + "/archive/"
        self.assertEqual(self.post(url, {"version": 1, "archived": True}).status_code, 200)
        self.assertEqual(self.client.get(self.base).json()["projects"], [])
        self.assertEqual(len(self.client.get(self.base + "?archived=true").json()["projects"]), 1)
        self.assertEqual(self.post(url, {"version": 1, "archived": False}).status_code, 409)
        self.assertEqual(self.post(url, {"version": 2, "archived": False}).status_code, 200)
        self.assertEqual(len(self.client.get(self.base).json()["projects"]), 1)
        self.assertEqual(Revision.objects.count(), 3)

    def test_removed_member_loses_existing_session_access(self):
        viewer = Client()
        viewer.force_login(self.viewer)
        self.assertEqual(viewer.get(self.base).status_code, 200)
        url = f"/api/workspaces/{self.org.pk}/members/{self.viewer.pk}/"
        self.assertEqual(self.post(url, {"role": "remove"}).status_code, 200)
        self.assertEqual(viewer.get(self.base).status_code, 403)
        owner_url = f"/api/workspaces/{self.org.pk}/members/{self.owner.pk}/"
        self.assertEqual(self.post(owner_url, {"role": "remove"}).status_code, 400)

    def test_production_never_allows_public_first_workspace_setup(self):
        from django.test import override_settings

        self.client.logout()
        with override_settings(DEBUG=False):
            self.assertEqual(
                self.post("/api/setup/", {"email": "test@example.test"}).status_code,
                403,
            )
