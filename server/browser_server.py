"""Run a disposable API for browser tests; never touches development accounts."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory(prefix="wildscape-api-test-") as directory:
    env = {
        **os.environ,
        "WILDSCAPE_DB": str(Path(directory) / "test.sqlite3"),
        "DJANGO_CSRF_ORIGINS": "http://127.0.0.1:5174",
    }
    manage = str(Path(__file__).parent / "manage.py")
    subprocess.run([sys.executable, manage, "migrate", "--noinput"], env=env, check=True)
    subprocess.run(
        [sys.executable, manage, "runserver", "127.0.0.1:8001", "--noreload"],
        env=env,
        check=True,
    )
