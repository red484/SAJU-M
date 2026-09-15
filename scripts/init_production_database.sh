#!/bin/sh
set -eu

: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required}"
: "${POSTGRES_URL:?POSTGRES_URL is required}"

credentials="${POSTGRES_URL#postgresql://}"
credentials="${credentials%%@*}"
app_user="${credentials%%:*}"
app_password="${credentials#*:}"
database_path="${POSTGRES_URL#*@}"
app_database="${database_path#*/}"
app_database="${app_database%%\?*}"

case "$app_user" in *[!a-zA-Z0-9_]*|'') echo "Invalid PostgreSQL app user" >&2; exit 1;; esac
case "$app_database" in *[!a-zA-Z0-9_]*|'') echo "Invalid PostgreSQL database" >&2; exit 1;; esac
case "$app_password" in *[!0-9a-fA-F]*|'') echo "Generated PostgreSQL password must be hexadecimal" >&2; exit 1;; esac

attempt=0
until pg_isready --dbname="$POSTGRES_ADMIN_URL" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "PostgreSQL did not become ready in time" >&2; exit 1; fi
  sleep 2
done

psql "$POSTGRES_ADMIN_URL" --set=ON_ERROR_STOP=1 --set=app_user="$app_user" --set=app_password="$app_password" --set=app_database="$app_database" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_database') \gexec
SQL

psql "$POSTGRES_URL" --set=ON_ERROR_STOP=1 --command='select 1' >/dev/null
