import uuid

from django.conf import settings
from django.db import models


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLES = [("owner", "Owner"), ("editor", "Editor"), ("viewer", "Viewer")]
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=ROLES, default="editor")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="one_workspace_membership"
            )
        ]


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT)
    name = models.CharField(max_length=250)
    data = models.JSONField()
    version = models.PositiveIntegerField(default=1)
    archived = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class Revision(models.Model):
    project = models.ForeignKey(Project, on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    data = models.JSONField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["project", "version"], name="one_project_version")
        ]


class AuditEvent(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=100)
    project = models.ForeignKey(Project, null=True, on_delete=models.PROTECT)
    version = models.PositiveIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Invitation(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE)
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=Membership.ROLES)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)


class LoginAttempt(models.Model):
    key = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)


class SurveySite(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(Organization, on_delete=models.PROTECT)
    name = models.CharField(max_length=180)
    longitude = models.FloatField()
    latitude = models.FloatField()
    profile = models.JSONField()
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=30, default="To review")
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)


class SurveySiteRevision(models.Model):
    site = models.ForeignKey(SurveySite, on_delete=models.PROTECT)
    version = models.PositiveIntegerField()
    name = models.CharField(max_length=180)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=30)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["site", "version"], name="one_survey_site_version")
        ]
