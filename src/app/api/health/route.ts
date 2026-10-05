import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Is the app up, and can it reach the database?
 *
 * /api/build answers "which code is this". This answers the two questions that
 * come up when a page throws and the build is fine: what Node the host is
 * actually running — package.json asks for >=20.9 and <23, and nothing has ever
 * checked what is there — and whether Postgres, which lives on a different
 * machine, answers at all.
 *
 * Deliberately says nothing about why a failure happened. The connection string
 * carries the database password, and Prisma errors have been known to quote it
 * back; "unreachable" plus how long it waited is all a public endpoint needs to
 * give. The detail belongs in the host's log, which instrumentation.ts writes.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "unreachable" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unreachable";
  }

  return NextResponse.json(
    {
      ok: database === "ok",
      node: process.version,
      database,
      databaseMs: Date.now() - started,
      sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
      at: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
