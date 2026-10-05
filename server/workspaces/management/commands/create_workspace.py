import getpass

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from workspaces.models import Membership, Organization
from workspaces.views import account_email, validate_password


class Command(BaseCommand):
    help = "Create a consultancy workspace and its first owner; password is prompted securely"

    def add_arguments(self, parser):
        parser.add_argument("name")
        parser.add_argument("email")

    def handle(self, *args, **options):
        email = account_email(options["email"])
        User = get_user_model()
        if User.objects.filter(username=email).exists():
            raise CommandError("This account already exists; use workspace management.")
        user = User(username=email, email=email)
        password = getpass.getpass("Owner password (12+ characters): ")
        if password != getpass.getpass("Repeat password: "):
            raise CommandError("Passwords do not match")
        try:
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError("; ".join(error.messages)) from error
        with transaction.atomic():
            user.set_password(password)
            user.save()
            organization = Organization.objects.create(name=options["name"])
            Membership.objects.create(organization=organization, user=user, role="owner")
        self.stdout.write(self.style.SUCCESS(f"Workspace created: {organization.name}"))
