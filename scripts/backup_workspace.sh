#!/bin/sh
set -eu
umask 077
backup_dir=${1:?Usage: backup_workspace.sh /secure/backup/directory}
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$backup_dir"
backup_dir=$(CDPATH= cd -- "$backup_dir" && pwd)
# Never publish an incomplete dump or overwrite a completed backup.
partial_path=$(mktemp "$backup_dir/.wildscape-partial.XXXXXXXX")
trap 'rm -f "$partial_path"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
docker compose --env-file "$repo_dir/deploy/production.env" -f "$repo_dir/compose.saas.yml" exec -T database pg_dump -U wildscape_saas -d wildscape_saas -Fc > "$partial_path"
test -s "$partial_path"
# Validate the archive directory before publishing; a full restore is still required.
docker compose --env-file "$repo_dir/deploy/production.env" -f "$repo_dir/compose.saas.yml" exec -T database pg_restore --list < "$partial_path" > /dev/null
backup_path="$backup_dir/wildscape-$(date -u +%Y%m%dT%H%M%SZ)-${partial_path##*.}.dump"
mv "$partial_path" "$backup_path"
trap - EXIT HUP INT TERM
printf 'Backup created: %s\n' "$backup_path"
