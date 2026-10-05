import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent
PRODUCTION = os.environ.get("WILDSCAPE_ENV") == "production"
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "")
if PRODUCTION and len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("Set a random DJANGO_SECRET_KEY of at least 50 characters")
SECRET_KEY = SECRET_KEY or "development-only-not-for-hosting-wildscape"
DEBUG = not PRODUCTION
ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "127.0.0.1,localhost,testserver").split(",")
CSRF_TRUSTED_ORIGINS = [
    x
    for x in os.environ.get(
        "DJANGO_CSRF_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
    ).split(",")
    if x
]
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "workspaces",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]
if os.environ.get("POSTGRES_HOST"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "HOST": os.environ["POSTGRES_HOST"],
            "PORT": os.environ.get("POSTGRES_PORT", "5432"),
            "NAME": os.environ.get("POSTGRES_DB", "wildscape"),
            "USER": os.environ.get("POSTGRES_USER", "wildscape"),
            "PASSWORD": os.environ["POSTGRES_PASSWORD"],
            "CONN_MAX_AGE": 60,
        }
    }
else:
    if PRODUCTION:
        raise ImproperlyConfigured("Production requires PostgreSQL")
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": os.environ.get("WILDSCAPE_DB", str(BASE_DIR / "development.sqlite3")),
            "OPTIONS": {"timeout": 20},
        }
    }
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
SESSION_COOKIE_AGE = 43200
SESSION_SAVE_EVERY_REQUEST = False
SECURE_SSL_REDIRECT = PRODUCTION
SECURE_HSTS_SECONDS = 31536000 if PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PRODUCTION
SECURE_HSTS_PRELOAD = PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
# Only the bundled reverse proxy may reach the API in production.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if PRODUCTION else None
CSRF_FAILURE_VIEW = "workspaces.views.csrf_failure"
DATA_UPLOAD_MAX_MEMORY_SIZE = 2_500_000
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"
STATIC_URL = "/admin-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
EMAIL_BACKEND = (
    "django.core.mail.backends.console.EmailBackend"
    if not PRODUCTION
    else "django.core.mail.backends.smtp.EmailBackend"
)
PUBLIC_URL = os.environ.get("WILDSCAPE_PUBLIC_URL", "http://127.0.0.1:5173").rstrip("/")
if PRODUCTION and not PUBLIC_URL.startswith("https://"):
    raise ImproperlyConfigured("Production PUBLIC_URL must use HTTPS")
EMAIL_HOST = os.environ.get("SMTP_HOST", "")
EMAIL_PORT = int(os.environ.get("SMTP_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("SMTP_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
EMAIL_USE_TLS = True
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.environ.get("EMAIL_FROM", "WildScape <noreply@localhost>")
PASSWORD_RESET_TIMEOUT = 3600
