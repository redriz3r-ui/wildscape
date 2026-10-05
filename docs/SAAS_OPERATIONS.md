# WildScape consultancy workspace operations

Status: locally tested SaaS implementation for a desert-consultancy pilot. This is not a public production launch or an ecological validation.

## Local use

The existing map demo remains at http://127.0.0.1:5173. Team mode is http://127.0.0.1:5173/?workspace=1.

1. Install server packages: `.venv/bin/pip install -r server/requirements.txt`.
2. Migrate: `.venv/bin/python server/manage.py migrate`.
3. Start API: `.venv/bin/python server/manage.py runserver 127.0.0.1:8000`.
4. Start frontend: `npm --prefix web run dev`.
5. Open team mode. On a fresh local database, create the first consultancy and owner account using the form. This setup endpoint is disabled in production.

Development uses `server/development.sqlite3`. It contains private project data and must never be published. Local demo projects remain in their existing browser storage; they are never automatically uploaded into an account. To move one, export its private backup, sign in to the intended consultancy, and restore the backup. Restoration assigns a new ID.

## Accounts and authorization

Django handles password hashing, session cookies, CSRF tokens and password validation. Cookies are HttpOnly; production requires HTTPS. Production configuration refuses a missing application secret, PostgreSQL connection, or HTTPS public URL.

Every project, revision, invitation and activity route checks workspace membership. Owners manage invitations and remove colleagues. Editors can create/edit/archive/restore projects. Viewers can read and export. All members are trusted to access sensitive evidence within their workspace; this release does not offer project-level or field-level access restrictions. Do not invite external clients into an internal evidence workspace unless authorized for all its data.

Invitations are scoped to an email and workspace, expire after 72 hours, and are single use. Only token hashes are stored. The app generates a private invitation URL for the owner to share directly; it does not send invitations automatically. An existing user must sign in to the invited account before accepting.

The API rate-limits login attempts by account and origin. The production proxy overwrites the client-IP header; the API must not be exposed independently of this proxy. User sessions expire after 12 hours. A password reset invalidates previous sessions; removing a member revokes workspace access on their next request.

Password recovery requires SMTP configuration in production. Links last one hour and are single use. Development recovery uses the private server console; it is not proof of email delivery. An administrator can run Django's `changepassword` command for assisted recovery after independently verifying the account owner.

## Saving and recovery

Cloud projects are stored in the server database, not browser local storage. Saves carry a server version. A stale version receives HTTP 409 and cannot replace newer evidence. Every accepted create/save/archive/restore produces a revision and an actor-attributed activity event. Scientific review status remains distinct from server version.

The app displays saving, saved, and failed states. A failed save stops later saves until addressed. Use Team workspace to download current edits privately, retry a network failure, or reload after preserving conflicting edits. Conflicts are deliberately not silently merged. The browser warns before leaving with unsaved edits. Team workspace provides downloads for the latest 25 revisions; older revisions remain in the database.

Archiving is reversible. No hard-delete endpoint is supplied. A deployment operator must define and implement a retention/deletion policy before offering deletion commitments. The activity log is append-only through the API; a database administrator can still change it, so it is not a tamper-proof audit ledger.

## Portable production deployment

The stack in `compose.saas.yml` uses PostgreSQL, a Django/Gunicorn API, and Caddy for the frontend and TLS. The app and database have no public ports; only the web proxy exposes 80/443. The public admin route is blocked. The web image copies the commercially filtered screening dataset and aerial tiles, excluding the legacy viewer's broader source mix.

Required external setup: a hosting machine with Docker, a domain pointing to it, a mail sender and SMTP credentials, a backup destination, and an operator responsible for monitoring and recovery. No accounts, domain purchases or live deployment have been performed.

1. Copy `deploy/production.env.example` to `deploy/production.env`. Fill the domain, a random secret of at least 50 characters, a strong database password, and SMTP variables. Keep this file private and permission-restricted.
2. Build: `docker compose --env-file deploy/production.env -f compose.saas.yml build`.
3. Start the database: `docker compose --env-file deploy/production.env -f compose.saas.yml up -d database`.
4. Migrate: `docker compose --env-file deploy/production.env -f compose.saas.yml run --rm api python manage.py migrate --noinput`.
5. Run Django deployment checks: `docker compose --env-file deploy/production.env -f compose.saas.yml run --rm api python manage.py check --deploy`.
6. Create the first client workspace: `docker compose --env-file deploy/production.env -f compose.saas.yml run --rm api python manage.py create_workspace 'Consultancy name' 'owner@example.com'`. The password is entered interactively without command-line logging.
7. Start services: `docker compose --env-file deploy/production.env -f compose.saas.yml up -d`.
8. Verify HTTPS, login, email recovery, saving, role restrictions, and shared exports on the actual deployment.

The health endpoint is `/api/health/`; it exercises the database. Configure external uptime alerts and container restart monitoring. Never log request bodies, credentials or private project JSON. This repository does not yet configure an external alert receiver.

## Backups and restore rehearsal

Run `sh scripts/backup_workspace.sh /secure/backup/directory` to create a PostgreSQL custom-format dump with restrictive local file permissions. The script writes a temporary file, checks its archive directory with `pg_restore --list`, and publishes it only after both commands succeed. Failed/empty dumps are removed. This check does not prove full recoverability. Schedule it at a frequency agreed with each client and copy encrypted backups to independent storage. The script alone is not an offsite-backup service. Set retention based on contractual and data-owner requirements.

Before accepting client data, rehearse restoration into a separate empty database with `pg_restore --no-owner --no-privileges`. Check counts, account login, project revisions, and a sampled field-evidence record against the original. Do not test restore against the live database. Record recovery time and the latest recoverable point. Backup encryption and restore validation remain deployment gates.

Survey-site rationale and status changes also retain actor-attributed revisions. The planner shows the latest 100 revisions for a selected site. Sites created before revision tracking retain their latest known state on their next edit; earlier overwritten states cannot be reconstructed. Private point exports include the saved assessment and source snapshot.

## Validation commands

- `.venv/bin/python server/manage.py test workspaces`: tenant isolation, roles, CSRF/session logout, conflict preservation, invitations, recovery, archiving and access removal.
- `npm --prefix web run test:browser -- --config playwright.workspace.config.ts`: isolated temporary database and two-browser team workflow. Test credentials and accounts never enter the development database.
- `npm --prefix web test`: scientific geometry, uncertainty, evidence and export tests.
- `npm --prefix web run build`: production compile.
- `npm --prefix web audit --omit=dev`: frontend runtime dependency audit.

A passing test suite does not establish ecological accuracy, production scale, regulatory suitability, or incident-response readiness. Those gates are tracked in `MARKET_READINESS.md`.


## Local PostgreSQL validation (2026-10-04)

PostgreSQL 17.11 was installed for isolated validation; no login-started service was configured. The temporary server used a private Unix socket and no TCP listener. All 18 API tests passed, including real concurrent project and survey-site saves. Each race accepted exactly one save, rejected the stale save with HTTP 409, and retained the corresponding revision.

`scripts/rehearse_postgres_restore.py` creates two uniquely named synthetic databases, migrates/seeds one, makes a custom-format dump, restores into the other, compares serialized application-record hashes, verifies password authentication, and checks private field evidence and revision history. It drops only those generated databases when finished. It requires a running local PostgreSQL socket and database-creation permission.

Example invocation (adjust binary/socket paths and database user):

```sh
.venv/bin/python scripts/rehearse_postgres_restore.py --bin /opt/homebrew/opt/postgresql@17/bin --socket-dir /tmp/wildscape-pg-validation --port 55439 --user YOUR_LOCAL_DATABASE_USER
```

The completed rehearsal used a 62,728-byte synthetic archive. Dump time was 0.373 seconds; restore time was 0.299 seconds. These figures describe only a tiny local fixture, not a production recovery objective. The archive contained one account, organization, membership, project and survey site, two project revisions and one survey-site revision. Source and restored application-record hashes matched; account authentication and the sensitive evidence flag survived restoration.

Production-container behavior, encrypted offsite backups and production-scale restoration remain unverified. The default Homebrew database initialization failed due to disk space; validation used its own temporary cluster instead. No production database or existing app data was touched. Build contexts now exclude nested environment/secret files, including `deploy/production.env`.
