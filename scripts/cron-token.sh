#!/usr/bin/env bash
# Prints the bearer token the reminder endpoint expects.
#
# CRON_SECRET wins if it is set. Otherwise it is derived from AUTH_SECRET, so a
# deployment that never had a dedicated cron secret still gets working reminders
# instead of a silently 401-ing endpoint. Derived, not defaulted: there is no
# fixed fallback value that would be the same on every install.
set -euo pipefail

if [ -n "${CRON_SECRET:-}" ]; then
  printf '%s' "$CRON_SECRET"
  exit 0
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "cron-token: set CRON_SECRET, or AUTH_SECRET to derive from" >&2
  exit 1
fi

printf '%s' "cron:$AUTH_SECRET" | openssl dgst -sha256 -hex | awk '{print $NF}'
