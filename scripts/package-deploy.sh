#!/usr/bin/env bash
#
# Builds the upload payload for SmarterASP.NET / site4now.
#
# The host does not run npm install or next build for us, and a node_modules
# built on Linux is not portable to their Windows Node. So we ship Next's
# standalone output, which contains only the traced runtime dependencies, plus
# the Windows Prisma engine.
#
# Result: deploy-payload/ (and deploy-payload.zip) that the host runs with
# nothing more than `node server.js`.
#
# Usage: npm run package
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy-payload"
ZIP="$ROOT/deploy-payload.zip"

cd "$ROOT"

# A source file that git ignores is a file the deploy will never see: the
# runner builds from a fresh checkout, so the payload silently comes out
# without it and the host answers 404 for something that works perfectly on
# the machine it was written on. That is not hypothetical — an unanchored
# `build/` in .gitignore swallowed src/app/api/build/route.ts, and the missing
# route was read as a host that would not restart for most of a day.
echo "==> Checking no source file is ignored"
IGNORED=$(git ls-files --others --ignored --exclude-standard -- \
  src messages prisma scripts .github 2>/dev/null || true)
if [ -n "$IGNORED" ]; then
  echo "These files exist here but are gitignored, so a fresh checkout will not have them:" >&2
  echo "$IGNORED" | sed 's/^/    /' >&2
  echo "Either commit them or stop ignoring them; the deploy builds from the checkout." >&2
  exit 1
fi

echo "==> Building"
npx prisma generate >/dev/null
npm run build >/dev/null

if [ ! -d "$ROOT/.next/standalone" ]; then
  echo "No .next/standalone — is output: 'standalone' still set in next.config.ts?" >&2
  exit 1
fi

echo "==> Assembling $OUT"
rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

# 1. Standalone output becomes the payload root. Note this already contains a
#    generated server.js: keep it. It inlines the build-time Next config, which
#    the repo's own server.js cannot do because next.config.ts is not shipped.
#    It reads PORT from the environment, which is exactly what
#    httpPlatformHandler provides via %HTTP_PLATFORM_PORT%.
cp -a "$ROOT/.next/standalone/." "$OUT/"

# 2. Static assets and public files are not included in standalone output.
mkdir -p "$OUT/.next/static"
cp -a "$ROOT/.next/static/." "$OUT/.next/static/"
mkdir -p "$OUT/public"
cp -a "$ROOT/public/." "$OUT/public/"

# 3. IIS configuration.
cp "$ROOT/web.config" "$OUT/web.config"

# 4. Schema and migrations, so `prisma migrate deploy` can be run against the
#    live database from a machine that can reach it.
mkdir -p "$OUT/prisma"
cp -a "$ROOT/prisma/schema.prisma" "$OUT/prisma/"
[ -d "$ROOT/prisma/migrations" ] && cp -a "$ROOT/prisma/migrations" "$OUT/prisma/"

# 5a. Drop the Linux query engine. binaryTargets fetches both, but the host runs
#     Windows and will never load the .so — it is 17 MB of dead weight, and it is
#     the file Windows had locked when a redeploy failed with "550 the process
#     cannot access the file".
rm -f "$OUT"/node_modules/.prisma/client/libquery_engine-*.so.node

# 5b. The Windows Prisma query engine. Built on Linux, the traced copy only has
#     the Linux engine, and the app cannot open a connection without this one.
PRISMA_OUT="$OUT/node_modules/.prisma/client"
if [ -f "$ROOT/node_modules/.prisma/client/query_engine-windows.dll.node" ]; then
  mkdir -p "$PRISMA_OUT"
  cp "$ROOT/node_modules/.prisma/client/query_engine-windows.dll.node" "$PRISMA_OUT/"
else
  echo "WARNING: no Windows Prisma engine found. Check binaryTargets in prisma/schema.prisma." >&2
fi

# 6. Environment file. Never committed; taken from secrets/production.env.
if [ -f "$ROOT/secrets/production.env" ]; then
  cp "$ROOT/secrets/production.env" "$OUT/.env"
  chmod 600 "$OUT/.env"
  echo "    .env written from secrets/production.env"
else
  echo "WARNING: secrets/production.env is missing — copy .env.example and fill it in." >&2
fi

# 7. Writable folders the app expects at runtime.
mkdir -p "$OUT/App_Data/uploads" "$OUT/App_Data/backups" "$OUT/logs"
touch "$OUT/App_Data/uploads/.keep" "$OUT/App_Data/backups/.keep" "$OUT/logs/.keep"

# 8. Drop build-only packages that dependency tracing pulls in but the running
#    server never loads. Saves roughly a third of the upload over FTP.
echo "==> Pruning build-only packages"
BEFORE=$(du -sm "$OUT" | cut -f1)
# sharp/@img is ~20 MB and only serves next/image, which this app does not use.
# Drop it while that stays true; adding an <Image> means removing it from this
# list and re-packaging.
for pkg in webpack @esbuild typescript terser @webassemblyjs uglify-js \
           watchpack tapable enhanced-resolve loader-runner schema-utils \
           webpack-sources jest-worker @img sharp; do
  rm -rf "${OUT:?}/node_modules/${pkg}"
done
AFTER=$(du -sm "$OUT" | cut -f1)
echo "    ${BEFORE} MB -> ${AFTER} MB"

# 9. Zip for the host's File Manager upload (much faster than FTP per-file).
if command -v zip >/dev/null 2>&1; then
  (cd "$OUT" && zip -qr "$ZIP" .)
  echo "==> Wrote $(basename "$ZIP") ($(du -sh "$ZIP" | cut -f1))"
else
  echo "==> zip not installed; upload the deploy-payload/ folder as-is"
fi

echo "==> Done. Upload the contents of deploy-payload/ to the site root."
