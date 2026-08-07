#!/usr/bin/env bash
# Testuje migracje + funkcje SQL na lokalnym, tymczasowym klastrze PostgreSQL.
# Wymaga zainstalowanego PostgreSQL 14+ (initdb/pg_ctl/psql w PATH lub /usr/lib/postgresql/*/bin).
set -euo pipefail

# initdb odmawia pracy jako root — przełącz się na użytkownika postgres.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  exec su -s /bin/bash postgres -c "$(printf '%q ' "$0" "$@")"
fi

PGBIN=$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")
WORKDIR=$(mktemp -d)
PGDATA="$WORKDIR/data"
SOCKDIR="$WORKDIR/sock"
PORT=54329
mkdir -p "$SOCKDIR"

cleanup() {
  "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

echo "==> initdb"
"$PGBIN/initdb" -D "$PGDATA" -A trust -U postgres >/dev/null

echo "==> start"
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$WORKDIR/pg.log" \
  -o "-p $PORT -k $SOCKDIR -c listen_addresses=''" start >/dev/null

PSQL=("$PGBIN/psql" -h "$SOCKDIR" -p "$PORT" -U postgres -d postgres
  -v ON_ERROR_STOP=1 -q)

echo "==> shim auth (emulacja Supabase)"
"${PSQL[@]}" -f supabase/tests/shim_auth.sql

echo "==> migracje"
for f in supabase/migrations/*.sql; do
  echo "    - $f"
  "${PSQL[@]}" -f "$f"
done

echo "==> granty jak w Supabase (RLS musi realnie bronić danych)"
"${PSQL[@]}" -c "
  grant usage on schema public to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public
    to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public
    to anon, authenticated, service_role;
"

echo "==> smoke test"
"${PSQL[@]}" -f supabase/tests/smoke.sql

echo "==> OK: migracje i funkcje SQL działają"
