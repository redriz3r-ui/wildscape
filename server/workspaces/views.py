import hashlib
import json
import secrets
from datetime import timedelta
from functools import wraps
from smtplib import SMTPException

from django.conf import settings
from django.contrib.auth import (
    authenticate,
    get_user_model,
    login,
    logout,
    update_session_auth_hash,
)
from django.contrib.auth.password_validation import validate_password as django_validate_password
from django.core.exceptions import RequestDataTooBig, ValidationError
from django.core.validators import validate_email
from django.db import connection, transaction
from django.db.models import F
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from .models import (
    AuditEvent,
    Invitation,
    LoginAttempt,
    Membership,
    Organization,
    Project,
    Revision,
)
from .validation import validate_project


def validate_password(password, user):
    if len(password) > 1024:
        raise ValidationError("Password must be at most 1024 characters.")
    django_validate_password(password, user)


def account_email(value):
    email = str(value).strip().lower()
    validate_email(email)
    if len(email) > 150:
        raise ValidationError("Email must be at most 150 characters.")
    return email


def response(data, status=200):
    result = JsonResponse(data, status=status)
    result["Cache-Control"] = "no-store"
    return result


def csrf_failure(request, reason=""):
    return response({"error": "Session protection check failed. Reload and try again."}, 403)


def api(methods, authenticated=True):
    def decorate(fn):
        @wraps(fn)
        @require_http_methods(methods)
        def wrapped(request, *args, **kwargs):
            if authenticated and not request.user.is_authenticated:
                return response({"error": "Sign in to your workspace."}, 401)
            try:
                request.payload = {}
                if request.method in {"POST", "PUT", "PATCH"}:
                    if request.content_type != "application/json":
                        return response({"error": "Use application/json"}, 415)
                    request.payload = json.loads(
                        request.body or b"{}",
                        parse_constant=lambda _: (_ for _ in ()).throw(
                            ValueError("Invalid number")
                        ),
                    )
                    if not isinstance(request.payload, dict):
                        raise ValueError("Expected an object")
                return fn(request, *args, **kwargs)
            except (ValidationError, ValueError, TypeError, RequestDataTooBig) as error:
                message = (
                    "; ".join(error.messages)
                    if isinstance(error, ValidationError)
                    else "Invalid request data"
                )
                return response({"error": message}, 400)

        return wrapped

    return decorate


def membership(request, organization_id, write=False, owner=False):
    m = Membership.objects.filter(organization_id=organization_id, user=request.user).first()
    if not m or (write and m.role == "viewer") or (owner and m.role != "owner"):
        return None
    return m


def setup_allowed(request):
    return (
        settings.DEBUG
        and request.META.get("REMOTE_ADDR") in {"127.0.0.1", "::1"}
        and not Organization.objects.exists()
    )


def user_data(request):
    return {
        "setupAllowed": setup_allowed(request),
        "user": {"id": request.user.pk, "email": request.user.email}
        if request.user.is_authenticated
        else None,
        "workspaces": [
            {"id": str(m.organization_id), "name": m.organization.name, "role": m.role}
            for m in Membership.objects.filter(user=request.user).select_related("organization")
        ]
        if request.user.is_authenticated
        else [],
        "csrfToken": get_token(request),
    }


@api(["GET"], authenticated=False)
def session(request):
    return response(user_data(request))


@api(["GET"], authenticated=False)
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return response({"status": "ok"})


@api(["POST"], authenticated=False)
def sign_in(request):
    email = str(request.payload.get("email", "")).strip().lower()[:254]
    password = str(request.payload.get("password", ""))[:1024]
    now = timezone.now()
    # Both account and origin limits; all workers share the database counters.
    keys = [
        hashlib.sha256(x.encode()).hexdigest()
        for x in (
            "account:" + email,
            "origin:"
            + (
                request.META.get("HTTP_X_REAL_IP", "")
                if settings.PRODUCTION
                else request.META.get("REMOTE_ADDR", "")
            ),
        )
    ]
    LoginAttempt.objects.filter(created_at__lt=now - timedelta(hours=1)).delete()
    if any(
        LoginAttempt.objects.filter(key=k, created_at__gt=now - timedelta(minutes=15)).count() >= 10
        for k in keys
    ):
        return response({"error": "Too many sign-in attempts. Try again in 15 minutes."}, 429)
    for key in keys:
        LoginAttempt.objects.create(key=key)
    user = authenticate(request, username=email, password=password)
    if user is None:
        return response({"error": "Email or password is incorrect."}, 401)
    LoginAttempt.objects.filter(key=keys[0]).delete()
    login(request, user)
    return response(user_data(request))


@api(["POST"])
def sign_out(request):
    logout(request)
    return response({"ok": True, "csrfToken": get_token(request)})


@api(["POST"])
def password(request):
    if not request.user.check_password(str(request.payload.get("current", ""))):
        return response({"error": "Current password is incorrect."}, 400)
    new = str(request.payload.get("password", ""))
    validate_password(new, request.user)
    request.user.set_password(new)
    request.user.save()
    update_session_auth_hash(request, request.user)
    return response({"ok": True})


def project_data(p):
    return {
        "id": str(p.id),
        "data": p.data,
        "version": p.version,
        "updatedAt": p.updated_at.isoformat(),
        "updatedBy": p.updated_by.email,
        "archived": p.archived,
    }


@api(["GET", "POST"])
def projects(request, organization_id):
    m = membership(request, organization_id, write=request.method == "POST")
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)
    if request.method == "GET":
        return response(
            {
                "projects": [
                    project_data(p)
                    for p in Project.objects.filter(
                        organization_id=organization_id,
                        archived=request.GET.get("archived") == "true",
                    )
                    .select_related("updated_by")
                    .order_by("-updated_at")
                ]
            }
        )
    data = validate_project(request.payload.get("data"))
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=organization_id)
        if Project.objects.filter(organization_id=organization_id).count() >= 200:
            return response(
                {"error": "Workspace project limit reached. Contact your administrator."},
                409,
            )
        # Client IDs are preserved for backups, but never allow overwrite at creation.
        if Project.objects.filter(pk=data["id"]).exists():
            return response({"error": "Project ID already exists. Import with a new ID."}, 409)
        p = Project.objects.create(
            id=data["id"],
            organization_id=organization_id,
            name=data["name"],
            data=data,
            updated_by=request.user,
        )
        Revision.objects.create(project=p, version=1, data=data, actor=request.user)
        AuditEvent.objects.create(
            organization=m.organization,
            actor=request.user,
            project=p,
            version=1,
            action="project.created",
        )
    return response(project_data(p), 201)


@api(["GET", "PUT"])
def project(request, organization_id, project_id):
    m = membership(request, organization_id, write=request.method == "PUT")
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)
    p = (
        Project.objects.filter(pk=project_id, organization_id=organization_id, archived=False)
        .select_related("updated_by")
        .first()
    )
    if not p:
        return response({"error": "Project unavailable."}, 404)
    if request.method == "GET":
        return response(project_data(p))
    data = validate_project(request.payload.get("data"))
    if data["id"] != str(p.id) or type(request.payload.get("version")) is not int:
        return response({"error": "Project ID and server version are required."}, 400)
    with transaction.atomic():
        updated = Project.objects.filter(
            pk=p.id, version=request.payload["version"], archived=False
        ).update(
            data=data,
            name=data["name"],
            version=F("version") + 1,
            updated_by=request.user,
            updated_at=timezone.now(),
        )
        if not updated:
            return response(
                {
                    "error": "Another teammate saved a newer revision. Keep a private backup of your edits, then reload the project."
                },
                409,
            )
        p.refresh_from_db()
        Revision.objects.create(project=p, version=p.version, data=data, actor=request.user)
        AuditEvent.objects.create(
            organization=m.organization,
            actor=request.user,
            project=p,
            version=p.version,
            action="project.saved",
        )
    return response(project_data(p))


@api(["GET"])
def revisions(request, organization_id, project_id):
    if not membership(request, organization_id):
        return response({"error": "Workspace unavailable."}, 403)
    p = Project.objects.filter(pk=project_id, organization_id=organization_id).first()
    if not p:
        return response({"error": "Project unavailable."}, 404)
    return response(
        {
            "revisions": [
                {
                    "version": r.version,
                    "createdAt": r.created_at.isoformat(),
                    "actor": r.actor.email,
                    "data": r.data,
                }
                for r in Revision.objects.filter(project=p)
                .select_related("actor")
                .order_by("-version")[:25]
            ]
        }
    )


@api(["GET"])
def audit(request, organization_id):
    if not membership(request, organization_id):
        return response({"error": "Workspace unavailable."}, 403)
    return response(
        {
            "events": [
                {
                    "action": e.action,
                    "actor": e.actor.email,
                    "projectId": str(e.project_id) if e.project_id else None,
                    "version": e.version,
                    "at": e.created_at.isoformat(),
                }
                for e in AuditEvent.objects.filter(organization_id=organization_id)
                .select_related("actor")
                .order_by("-created_at")[:100]
            ]
        }
    )


@api(["GET"])
def members(request, organization_id):
    if not membership(request, organization_id):
        return response({"error": "Workspace unavailable."}, 403)
    return response(
        {
            "members": [
                {"id": m.user_id, "email": m.user.email, "role": m.role}
                for m in Membership.objects.filter(organization_id=organization_id).select_related(
                    "user"
                )
            ]
        }
    )


@api(["POST"])
def invite(request, organization_id):
    m = membership(request, organization_id, owner=True)
    if not m:
        return response({"error": "Only workspace owners can invite teammates."}, 403)
    email = account_email(request.payload.get("email", ""))
    role = request.payload.get("role", "editor")
    if role not in {"editor", "viewer"}:
        return response({"error": "Choose editor or viewer."}, 400)
    token = secrets.token_urlsafe(32)
    Invitation.objects.filter(organization=m.organization, email=email, used_at=None).delete()
    Invitation.objects.create(
        organization=m.organization,
        email=email,
        role=role,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        expires_at=timezone.now() + timedelta(days=3),
    )
    AuditEvent.objects.create(
        organization=m.organization, actor=request.user, action="member.invited"
    )
    return response({"invitationToken": token, "email": email, "expiresInHours": 72}, 201)


@api(["POST"], authenticated=False)
def accept_invite(request):
    token_hash = hashlib.sha256(str(request.payload.get("token", "")).encode()).hexdigest()
    with transaction.atomic():
        invitation = (
            Invitation.objects.select_for_update()
            .filter(token_hash=token_hash, used_at=None, expires_at__gt=timezone.now())
            .first()
        )
        if not invitation:
            return response({"error": "Invitation is invalid or expired."}, 400)
        User = get_user_model()
        user = User.objects.filter(username=invitation.email).first()
        if user:
            if not request.user.is_authenticated or request.user.pk != user.pk:
                return response(
                    {"error": "Sign in with the invited email, then open this invitation again."},
                    401,
                )
        else:
            user = User(username=invitation.email, email=invitation.email)
            password_value = str(request.payload.get("password", ""))
            validate_password(password_value, user)
            user.set_password(password_value)
            user.save()
        Membership.objects.get_or_create(
            user=user,
            organization=invitation.organization,
            defaults={"role": invitation.role},
        )
        invitation.used_at = timezone.now()
        invitation.save()
        AuditEvent.objects.create(
            organization=invitation.organization, actor=user, action="member.joined"
        )
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return response(user_data(request))


@api(["POST"], authenticated=False)
def setup(request):
    if not setup_allowed(request):
        return response({"error": "Workspace setup is unavailable."}, 403)
    email = account_email(request.payload.get("email", ""))
    name = str(request.payload.get("name", "")).strip()
    if not name or len(name) > 180:
        return response({"error": "Provide a workspace name of 1–180 characters."}, 400)
    User = get_user_model()
    if User.objects.filter(username=email).exists():
        return response(
            {"error": "Account already exists. Use the administrator setup command."},
            409,
        )
    user = User(username=email, email=email)
    password_value = str(request.payload.get("password", ""))
    validate_password(password_value, user)
    with transaction.atomic():
        user.set_password(password_value)
        user.save()
        org = Organization.objects.create(name=name)
        Membership.objects.create(organization=org, user=user, role="owner")
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    return response(user_data(request), 201)


@api(["POST"])
def change_member(request, organization_id, user_id):
    m = membership(request, organization_id, owner=True)
    if not m:
        return response({"error": "Only workspace owners can manage access."}, 403)
    role = request.payload.get("role")
    if role not in {"editor", "viewer", "remove"}:
        return response({"error": "Choose editor, viewer or remove."}, 400)
    with transaction.atomic():
        target = (
            Membership.objects.select_for_update()
            .filter(organization=m.organization, user_id=user_id)
            .first()
        )
        if not target:
            return response({"error": "Member unavailable."}, 404)
        if target.role == "owner":
            return response({"error": "Owner access requires administrator review."}, 400)
        if role == "remove":
            target.delete()
        else:
            target.role = role
            target.save()
        AuditEvent.objects.create(
            organization=m.organization,
            actor=request.user,
            action="member.removed" if role == "remove" else "member.role_changed",
        )
    return response({"ok": True})


@api(["POST"], authenticated=False)
def request_reset(request):
    import logging

    from django.contrib.auth.tokens import default_token_generator
    from django.core.mail import send_mail
    from django.utils.encoding import force_bytes
    from django.utils.http import urlsafe_base64_encode

    if settings.PRODUCTION and not settings.EMAIL_HOST:
        return response(
            {"error": "Email recovery is not configured. Contact your workspace administrator."},
            503,
        )
    email = str(request.payload.get("email", "")).strip().lower()[:254]
    key = hashlib.sha256(("reset:" + email).encode()).hexdigest()
    cutoff = timezone.now() - timedelta(hours=1)
    if LoginAttempt.objects.filter(key=key, created_at__gt=cutoff).count() >= 3:
        return response({"ok": True})
    LoginAttempt.objects.create(key=key)
    for user in get_user_model().objects.filter(email__iexact=email, is_active=True):
        if not user.has_usable_password():
            continue
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        url = f"{settings.PUBLIC_URL}/?workspace=1#reset={uid}.{token}"
        try:
            send_mail(
                "Reset your WildScape password",
                f"Use this link within one hour to choose a new password:\n\n{url}\n\nIf you did not request this, ignore this message.",
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
            )
        except (OSError, SMTPException):
            logging.getLogger(__name__).error(
                "Password recovery delivery failed; check mail service configuration"
            )
    return response({"ok": True})


@api(["POST"], authenticated=False)
def reset_password(request):
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.http import urlsafe_base64_decode

    try:
        uid, token = str(request.payload.get("token", "")).split(".", 1)
        user_id = int(urlsafe_base64_decode(uid).decode())
    except (ValueError, TypeError, UnicodeDecodeError):
        return response({"error": "Reset link is invalid or expired."}, 400)
    with transaction.atomic():
        user = (
            get_user_model().objects.select_for_update().filter(pk=user_id, is_active=True).first()
        )
        if not user or not default_token_generator.check_token(user, token):
            return response({"error": "Reset link is invalid or expired."}, 400)
        new = str(request.payload.get("password", ""))
        validate_password(new, user)
        user.set_password(new)
        user.save()
    return response({"ok": True})


@api(["POST"])
def archive_project(request, organization_id, project_id):
    m = membership(request, organization_id, write=True)
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)
    archived = request.payload.get("archived")
    version = request.payload.get("version")
    if type(archived) is not bool or type(version) is not int:
        return response({"error": "Archived state and server version are required."}, 400)
    with transaction.atomic():
        p = (
            Project.objects.select_for_update()
            .filter(pk=project_id, organization=m.organization)
            .first()
        )
        if not p:
            return response({"error": "Project unavailable."}, 404)
        if p.version != version:
            return response(
                {"error": "Project changed. Reload before archiving or restoring."}, 409
            )
        p.archived = archived
        p.version += 1
        p.updated_by = request.user
        p.save()
        Revision.objects.create(project=p, version=p.version, data=p.data, actor=request.user)
        AuditEvent.objects.create(
            organization=m.organization,
            project=p,
            version=p.version,
            actor=request.user,
            action="project.archived" if archived else "project.restored",
        )
    return response(project_data(p))


@api(["POST"], authenticated=False)
def mojave_point(request):
    import math

    from django.core import signing
    from django.core.cache import cache

    from .mojave import profile

    if settings.PRODUCTION and not request.user.is_authenticated:
        return response({"error": "Sign in to inspect survey locations."}, 401)
    lon, lat = request.payload.get("longitude"), request.payload.get("latitude")
    radius = request.payload.get("halfWidthM", 5000)
    if any(
        type(v) not in (int, float) or not math.isfinite(v) for v in (lon, lat)
    ) or radius not in (1000, 5000, 10000):
        return response(
            {"error": "Provide finite longitude, latitude and a supported search size."}, 400
        )
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return response({"error": "Coordinates must use WGS84 decimal degrees."}, 400)
    key = f"mojave-v1:{lon}:{lat}:{radius}"
    cached = cache.get(key)
    if cached:
        return response(
            {
                **cached,
                "cached": True,
                "evidenceToken": signing.dumps(cached, salt="mojave-evidence", compress=True),
            }
        )
    identity = (
        str(request.user.pk)
        if request.user.is_authenticated
        else request.META.get("REMOTE_ADDR", "")
    )
    throttle = hashlib.sha256(("point:" + identity).encode()).hexdigest()
    cutoff = timezone.now() - timedelta(hours=1)
    if LoginAttempt.objects.filter(key=throttle, created_at__gt=cutoff).count() >= 120:
        return response({"error": "Point lookup limit reached. Try again later."}, 429)
    LoginAttempt.objects.create(key=throttle)
    try:
        data = profile(lon, lat, radius)
    except ValueError as error:
        return response({"error": str(error)}, 400)
    complete = all(s["status"] != "unavailable" for s in data["sources"].values())
    cache.set(key, data, 86400 if complete else 60)
    return response(
        {
            **data,
            "cached": False,
            "evidenceToken": signing.dumps(data, salt="mojave-evidence", compress=True),
        }
    )


@api(["GET", "POST"])
def survey_sites(request, organization_id):
    from .models import SurveySite, SurveySiteRevision
    from .mojave import in_region

    m = membership(request, organization_id, write=request.method == "POST")
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)

    def serialize(site):
        return {
            "id": str(site.id),
            "name": site.name,
            "longitude": site.longitude,
            "latitude": site.latitude,
            "profile": site.profile,
            "notes": site.notes,
            "status": site.status,
            "version": site.version,
            "updatedAt": site.updated_at.isoformat(),
            "updatedBy": site.updated_by.email,
        }

    if request.method == "GET":
        return response(
            {
                "sites": [
                    serialize(s)
                    for s in SurveySite.objects.filter(organization=m.organization)
                    .select_related("updated_by")
                    .order_by("-updated_at")[:200]
                ]
            }
        )
    data = request.payload
    name = str(data.get("name", "")).strip()
    notes = str(data.get("notes", ""))
    state = data.get("status", "To review")
    from django.core import signing

    try:
        snapshot = signing.loads(
            data.get("evidenceToken", ""), salt="mojave-evidence", max_age=86400
        )
    except (signing.BadSignature, TypeError):
        return response(
            {"error": "Inspect the point again before saving its evidence snapshot."}, 400
        )
    if (
        not name
        or len(name) > 180
        or len(notes) > 20000
        or state not in {"To review", "Survey planned", "Surveyed", "Deprioritized"}
    ):
        return response({"error": "Provide a valid site name, notes and review status."}, 400)
    if (
        not isinstance(snapshot, dict)
        or snapshot.get("schema") != 1
        or not isinstance(snapshot.get("sources"), dict)
    ):
        return response({"error": "Inspect the point before saving its evidence snapshot."}, 400)
    lon, lat = snapshot.get("longitude"), snapshot.get("latitude")
    if type(lon) not in (int, float) or type(lat) not in (int, float) or not in_region(lon, lat):
        return response({"error": "Site lies outside the Mojave pilot region."}, 400)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=organization_id)
        if SurveySite.objects.filter(organization=m.organization).count() >= 200:
            return response({"error": "Workspace site limit reached."}, 409)
        site = SurveySite.objects.create(
            organization=m.organization,
            name=name,
            longitude=lon,
            latitude=lat,
            profile=snapshot,
            notes=notes,
            status=state,
            updated_by=request.user,
        )
        SurveySiteRevision.objects.create(
            site=site,
            version=site.version,
            name=site.name,
            notes=site.notes,
            status=site.status,
            actor=request.user,
        )
        AuditEvent.objects.create(
            organization=m.organization, actor=request.user, action="survey_site.created"
        )
    return response(serialize(site), 201)


@api(["POST"])
def update_survey_site(request, organization_id, site_id):
    from .models import SurveySite, SurveySiteRevision

    m = membership(request, organization_id, write=True)
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)
    data = request.payload
    name = str(data.get("name", "")).strip()
    notes = str(data.get("notes", ""))
    state = data.get("status")
    if (
        not name
        or len(name) > 180
        or len(notes) > 20000
        or state not in {"To review", "Survey planned", "Surveyed", "Deprioritized"}
    ):
        return response({"error": "Provide a valid site name, notes and review status."}, 400)
    with transaction.atomic():
        site = (
            SurveySite.objects.select_for_update()
            .filter(pk=site_id, organization=m.organization)
            .first()
        )
        if not site:
            return response({"error": "Survey site unavailable."}, 404)
        if type(data.get("version")) is not int or site.version != data["version"]:
            return response(
                {"error": "Another teammate updated this site. Reload before saving."}, 409
            )
        # Preserve the currently known state for sites created before revision tracking.
        SurveySiteRevision.objects.get_or_create(
            site=site,
            version=site.version,
            defaults={
                "name": site.name,
                "notes": site.notes,
                "status": site.status,
                "actor": site.updated_by,
            },
        )
        site.name, site.notes, site.status = name, notes, state
        site.version += 1
        site.updated_by = request.user
        site.save()
        SurveySiteRevision.objects.create(
            site=site,
            version=site.version,
            name=site.name,
            notes=site.notes,
            status=site.status,
            actor=request.user,
        )
        AuditEvent.objects.create(
            organization=m.organization, actor=request.user, action="survey_site.updated"
        )
    return response(
        {
            "id": str(site.id),
            "name": site.name,
            "longitude": site.longitude,
            "latitude": site.latitude,
            "profile": site.profile,
            "notes": site.notes,
            "status": site.status,
            "version": site.version,
            "updatedAt": site.updated_at.isoformat(),
            "updatedBy": site.updated_by.email,
        }
    )


@api(["GET"])
def survey_site_revisions(request, organization_id, site_id):
    from .models import SurveySite, SurveySiteRevision

    m = membership(request, organization_id)
    if not m:
        return response({"error": "Workspace unavailable or permission denied."}, 403)
    if not SurveySite.objects.filter(pk=site_id, organization=m.organization).exists():
        return response({"error": "Survey site unavailable."}, 404)
    rows = (
        SurveySiteRevision.objects.filter(site_id=site_id)
        .select_related("actor")
        .order_by("-version")[:100]
    )
    return response(
        {
            "revisions": [
                {
                    "version": r.version,
                    "name": r.name,
                    "notes": r.notes,
                    "status": r.status,
                    "actor": r.actor.email,
                    "recordedAt": r.created_at.isoformat(),
                }
                for r in rows
            ]
        }
    )


@api(["POST"], authenticated=False)
def mojave_record_areas(request):
    import math

    from django.core.cache import cache

    from .mojave import record_areas

    if settings.PRODUCTION and not request.user.is_authenticated:
        return response({"error": "Sign in to search survey areas."}, 401)
    lon, lat = request.payload.get("longitude"), request.payload.get("latitude")
    cell_km = request.payload.get("cellSizeKm", 25)
    since_year = request.payload.get("sinceYear", 0)
    if (
        any(type(v) not in (int, float) or not math.isfinite(v) for v in (lon, lat))
        or not (-180 <= lon <= 180 and -90 <= lat <= 90)
        or type(cell_km) is not int
        or cell_km not in (25, 50)
        or type(since_year) is not int
        or since_year not in (0, 2015, 2020)
    ):
        return response(
            {"error": "Provide a valid map center and an area size of 25 or 50 km."}, 400
        )
    lon, lat = round(lon, 3), round(lat, 3)
    key = f"mojave-record-areas-v2:{lon}:{lat}:{cell_km}:{since_year}"
    cached = cache.get(key)
    if cached:
        return response({**cached, "cached": True})
    identity = (
        str(request.user.pk)
        if request.user.is_authenticated
        else request.META.get("REMOTE_ADDR", "")
    )
    throttle = hashlib.sha256(("record-areas:" + identity).encode()).hexdigest()
    cutoff = timezone.now() - timedelta(hours=1)
    if LoginAttempt.objects.filter(key=throttle, created_at__gt=cutoff).count() >= 12:
        return response({"error": "Area search limit reached. Try again later."}, 429)
    LoginAttempt.objects.create(key=throttle)
    try:
        data = record_areas(lon, lat, cell_km, since_year)
    except ValueError as error:
        return response({"error": str(error)}, 400)
    cache.set(key, data, 86400 if data["status"] == "complete" else 60)
    return response({**data, "cached": False})
