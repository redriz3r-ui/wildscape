#!/bin/sh
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir"
.venv/bin/python server/manage.py migrate --noinput
.venv/bin/python server/manage.py runserver 127.0.0.1:8000 --noreload &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Confirm the API is ready before showing the web address.
.venv/bin/python - <<'PY'
import time
import urllib.error
import urllib.request
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=1) as response:
            if response.status == 200:
                break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(0.25)
else:
    raise SystemExit('WildScape API did not start; inspect the error above.')
PY
printf 'WildScape: http://127.0.0.1:5173/\nMojave planner: http://127.0.0.1:5173/?planner=mojave\n'
cd web
npm run dev
