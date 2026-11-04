#!/usr/bin/env bash
set -euo pipefail
umask 077
config_dir=$(cd -- "$(dirname -- "$0")" && pwd)
cd "$config_dir/../.."
if [[ ! -f docker-compose.db.yml || ! -f .env.db ]]; then
    echo 'No local database Compose configuration; external database logs require separate review.'
    exit 0
fi
[[ -S /var/spool/rsyslog/saju.sock ]] || { echo 'Install service logging first' >&2; exit 1; }
project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' saju-db)
service=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' saju-db)
[[ $project == saju-db && $service == saju-db ]] || { echo 'Unexpected local database owner' >&2; exit 1; }
if docker inspect -f '{{json .HostConfig.LogConfig}}' saju-db | python3 -c 'import json,sys;d=json.load(sys.stdin);sys.exit(0 if d=={"Type":"syslog","Config":{"syslog-address":"unixgram:///var/spool/rsyslog/saju.sock","syslog-format":"rfc5424micro","tag":"saju-db","cache-disabled":"true"}} else 1)'; then
    echo 'Database logging already uses the 30-day service log; no restart.'
    exit 0
fi
export SAJU_DB_LOG_IMAGE=$(docker inspect -f '{{.Image}}' saju-db)
volume=$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' saju-db)
[[ -n $volume ]] || { echo 'No persistent database volume found' >&2; exit 1; }
compose() { docker compose --env-file .env.db -p "$project" -f docker-compose.db.yml "$@"; }
compose -f "$config_dir/database-logs.yml" config --format json | python3 "$config_dir/validate-database-logs.py" "$project" "$volume" "$SAJU_DB_LOG_IMAGE"
rollback_config=$(mktemp)
trap 'rm -f "$rollback_config"' EXIT
docker inspect -f '{{json .HostConfig.LogConfig}}' saju-db | python3 -c 'import json,os,sys;d=json.load(sys.stdin);print(json.dumps({"services":{"saju-db":{"image":os.environ["SAJU_DB_LOG_IMAGE"],"logging":{"driver":d["Type"],"options":d["Config"]}}}}))' > "$rollback_config"
ready() {
    for _ in $(seq 1 30); do
        if docker exec saju-db sh -c 'pg_isready -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"' >/dev/null 2>&1; then return 0; fi
        sleep 1
    done
    return 1
}
if ! compose -f "$config_dir/database-logs.yml" up -d --no-deps --no-build --pull never --force-recreate saju-db || ! ready; then
    echo 'Database logging update failed; restoring the previous logging configuration.' >&2
    compose -f "$rollback_config" up -d --no-deps --no-build --pull never --force-recreate saju-db
    ready
    exit 1
fi
[[ $(docker inspect -f '{{.Image}}' saju-db) == "$SAJU_DB_LOG_IMAGE" ]]
[[ $(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' saju-db) == "$volume" ]]
echo 'Database logs now use the 30-day service log; image and data volume preserved.'
