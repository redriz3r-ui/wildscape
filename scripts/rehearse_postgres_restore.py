"""Restore rehearsal using newly created synthetic databases only.

Requires an already-running private PostgreSQL server. Never reads or restores
an existing application database. Both generated databases are dropped on exit.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = """
import uuid
from django.contrib.auth import get_user_model
from django.test import Client
from workspaces.models import Organization,Membership,Project,Revision,SurveySite,SurveySiteRevision
from workspaces.tests import sample_project
u=get_user_model().objects.create_user('restore@example.test',email='restore@example.test',password='Synthetic-recovery-password!8')
o=Organization.objects.create(name='SYNTHETIC restore rehearsal')
Membership.objects.create(user=u,organization=o,role='owner')
d=sample_project()
d['field']=[{'id':str(uuid.uuid4()),'name':'SYNTHETIC burrow sign','date':'2026-10-04','observer':'Test observer','kind':'Burrow / sign','method':'Synthetic test only','effort':'10 minutes','notes':'Preserve this private evidence','photo':'','sensitive':True,'geometry':{'type':'Point','coordinates':[-114.6,37.22]}}]
p=Project.objects.create(id=d['id'],organization=o,name=d['name'],data=d,version=2,updated_by=u)
Revision.objects.create(project=p,version=1,data={**d,'notes':'Earlier rationale'},actor=u)
Revision.objects.create(project=p,version=2,data=d,actor=u)
s=SurveySite.objects.create(organization=o,name='SYNTHETIC candidate',longitude=-116,latitude=35,profile={'schema':1,'sources':{},'synthetic':True},notes='Verify access',status='Survey planned',updated_by=u)
SurveySiteRevision.objects.create(site=s,version=1,name=s.name,notes=s.notes,status=s.status,actor=u)
"""
VERIFY = """
import hashlib,json
from django.contrib.auth import authenticate
from django.core import serializers
from django.apps import apps
from workspaces.models import Project,Revision,SurveySiteRevision
models=list(apps.get_app_config('workspaces').get_models())+[apps.get_model('auth','User')]
objects=[obj for model in models for obj in model.objects.order_by('pk')]
rows=json.loads(serializers.serialize('json',objects))
assert authenticate(username='restore@example.test',password='Synthetic-recovery-password!8') is not None
assert Project.objects.get().data['field'][0]['notes']=='Preserve this private evidence'
assert Project.objects.get().data['field'][0]['sensitive'] is True
assert Revision.objects.count()==2
assert SurveySiteRevision.objects.count()==1
print(json.dumps({'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest(),'counts':{model._meta.label:model.objects.count() for model in models}},sort_keys=True))
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bin", required=True, type=Path)
    parser.add_argument("--socket-dir", required=True, type=Path)
    parser.add_argument("--port", default="55439")
    parser.add_argument("--user", required=True)
    args = parser.parse_args()
    # No network hosts: rehearsal is restricted to a private local socket.
    if not args.socket_dir.is_absolute() or not args.socket_dir.is_dir():
        parser.error("Provide an existing absolute local socket directory")
    prefix = "wildscape_rehearsal_" + uuid.uuid4().hex[:12]
    databases = [prefix + "_source", prefix + "_restored"]
    created = []
    env = {
        **os.environ,
        "PGHOST": str(args.socket_dir),
        "PGPORT": args.port,
        "PGUSER": args.user,
        "POSTGRES_HOST": str(args.socket_dir),
        "POSTGRES_PORT": args.port,
        "POSTGRES_USER": args.user,
        "POSTGRES_PASSWORD": "",
        "WILDSCAPE_ENV": "development",
    }

    def run(command, database=None):
        return subprocess.run(
            command,
            cwd=ROOT,
            env={**env, **({"POSTGRES_DB": database} if database else {})},
            capture_output=True,
            text=True,
            check=True,
        ).stdout

    def django(command, database):
        return run([sys.executable, "server/manage.py", *command], database)

    try:
        for database in databases:
            run([str(args.bin / "createdb"), database])
            created.append(database)
        django(["migrate", "--noinput"], databases[0])
        django(["shell", "-c", SEED], databases[0])
        before = json.loads(
            django(["shell", "-c", VERIFY], databases[0]).strip().splitlines()[-1]
        )
        with tempfile.TemporaryDirectory(prefix="wildscape-restore-") as folder:
            archive = Path(folder) / "synthetic.dump"
            started = time.monotonic()
            run(
                [
                    str(args.bin / "pg_dump"),
                    "-d",
                    databases[0],
                    "-Fc",
                    "-f",
                    str(archive),
                ]
            )
            archive.chmod(0o600)
            dump_seconds = time.monotonic() - started
            started = time.monotonic()
            run(
                [
                    str(args.bin / "pg_restore"),
                    "--exit-on-error",
                    "--no-owner",
                    "--no-privileges",
                    "-d",
                    databases[1],
                    str(archive),
                ]
            )
            restore_seconds = time.monotonic() - started
            after = json.loads(
                django(["shell", "-c", VERIFY], databases[1]).strip().splitlines()[-1]
            )
            if before != after:
                raise RuntimeError("Restored records differ from the source database")
            print(
                json.dumps(
                    {
                        "status": "passed",
                        "databaseVersion": run(
                            [str(args.bin / "postgres"), "--version"]
                        ).strip(),
                        "archiveBytes": archive.stat().st_size,
                        "dumpSeconds": round(dump_seconds, 3),
                        "restoreSeconds": round(restore_seconds, 3),
                        "verified": before,
                        "scope": "Synthetic local PostgreSQL restore; not production recovery timing",
                    },
                    indent=2,
                )
            )
    finally:
        for database in reversed(created):
            run([str(args.bin / "dropdb"), "--if-exists", database])


if __name__ == "__main__":
    main()
