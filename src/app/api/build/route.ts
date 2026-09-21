import { NextResponse } from "next/server";

/**
 * Which build is on the host, in a form a script can read.
 *
 * "The deploy succeeded" and "what the phone loads is this code" are different
 * claims, and until this existed only the first could be checked from outside.
 * The stamp is inlined at build time, so it describes the payload that is
 * actually serving the request rather than anything the host could set
 * separately from the files it holds.
 *
 * Public on purpose: it is the same commit hash that any signed-in person can
 * already read at the bottom of More, it identifies a build rather than
 * anything about the business, and a check that needs a session cannot be run
 * by the deploy that is trying to prove itself.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      sha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
      at: process.env.NEXT_PUBLIC_BUILD_AT ?? null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
