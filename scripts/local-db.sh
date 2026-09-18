#!/usr/bin/env bash
# Local Postgres 16 cluster for development in this session.
# The real site4now database is not reachable from the build sandbox (TCP 5432
# and 6432 are blocked by egress policy), so development runs against this.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
# Postgres refuses to run as root. In this container we are root, so drop to the
# `postgres` account for the server commands; on a normal dev box RUN is empty.
PGUSER_ACC=postgres
if [ "$(id -u)" = "0" ]; then
  RUN=(setpriv --reuid="$PGUSER_ACC" --regid="$PGUSER_ACC" --clear-groups --)
else
  RUN=()
fi
PGDATA="$(cd "$(dirname "$0")/.." && pwd)/.pgdata"
PGPORT=5433
LOGFILE="$PGDATA/server.log"

case "${1:-}" in
  start)
    mkdir -p "$PGDATA"
    if [ "$(id -u)" = "0" ]; then chown "$PGUSER_ACC:$PGUSER_ACC" "$PGDATA"; fi
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
      echo "Initialising cluster at $PGDATA"
      "${RUN[@]}" "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust >/dev/null
      # shellcheck disable=SC2016
      echo "unix_socket_directories = '$PGDATA'" >> "$PGDATA/postgresql.conf"
      echo "port = $PGPORT" >> "$PGDATA/postgresql.conf"
      echo "listen_addresses = '127.0.0.1'" >> "$PGDATA/postgresql.conf"
    fi
    if "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
      echo "Already running on port $PGPORT"
    else
      "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOGFILE" start
      sleep 1
    fi
    "${RUN[@]}" "$PGBIN/psql" -h 127.0.0.1 -p "$PGPORT" -U postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='liveconsole_hr'" | grep -q 1 || \
      "${RUN[@]}" "$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres liveconsole_hr
    echo "Ready: postgresql://postgres@127.0.0.1:$PGPORT/liveconsole_hr"
    ;;
  stop)
    "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" stop || true
    ;;
  status)
    "${RUN[@]}" "$PGBIN/pg_ctl" -D "$PGDATA" status || true
    ;;
  *)
    echo "usage: $0 {start|stop|status}" >&2
    exit 2
    ;;
esac
