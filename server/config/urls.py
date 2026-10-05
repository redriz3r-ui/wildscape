from django.contrib import admin
from django.urls import path

from workspaces import views

urlpatterns = [
    path("api/mojave/record-areas/", views.mojave_record_areas),
    path(
        "api/workspaces/<uuid:organization_id>/sites/<uuid:site_id>/revisions/",
        views.survey_site_revisions,
    ),
    path("api/workspaces/<uuid:organization_id>/sites/<uuid:site_id>/", views.update_survey_site),
    path("api/workspaces/<uuid:organization_id>/sites/", views.survey_sites),
    path("api/mojave/point/", views.mojave_point),
    path("admin/", admin.site.urls),
    path("api/health/", views.health),
    path("api/session/", views.session),
    path("api/setup/", views.setup),
    path(
        "api/workspaces/<uuid:organization_id>/members/<int:user_id>/",
        views.change_member,
    ),
    path("api/login/", views.sign_in),
    path("api/logout/", views.sign_out),
    path("api/password/", views.password),
    path("api/password/request-reset/", views.request_reset),
    path("api/password/reset/", views.reset_password),
    path(
        "api/workspaces/<uuid:organization_id>/projects/<uuid:project_id>/archive/",
        views.archive_project,
    ),
    path("api/invitations/accept/", views.accept_invite),
    path("api/workspaces/<uuid:organization_id>/projects/", views.projects),
    path(
        "api/workspaces/<uuid:organization_id>/projects/<uuid:project_id>/",
        views.project,
    ),
    path(
        "api/workspaces/<uuid:organization_id>/projects/<uuid:project_id>/revisions/",
        views.revisions,
    ),
    path("api/workspaces/<uuid:organization_id>/audit/", views.audit),
    path("api/workspaces/<uuid:organization_id>/members/", views.members),
    path("api/workspaces/<uuid:organization_id>/invitations/", views.invite),
]
