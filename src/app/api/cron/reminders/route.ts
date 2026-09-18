import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runReminders } from "@/lib/reminders";

/**
 * Shared Windows hosting gives us no scheduler, so an external one
 * (cron-job.org) calls this once a day. It is therefore a public URL, and the
 * only thing standing in front of it is CRON_SECRET.
 *
 * GET is supported because most free schedulers can only issue a GET, and the
 * handler is idempotent by design: a repeat call inside the same India-local
 * day sends nothing (see ReminderLog).
 */
export const dynamic = "force-dynamic";

function tokenMatches(supplied: string | null): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  // No secret configured means the endpoint stays shut rather than wide open.
  if (!expected || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function suppliedToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("token");
}

async function handle(request: Request) {
  if (!tokenMatches(suppliedToken(request))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runReminders();
    // A partial failure is still a 200: the scheduler must not retry the whole
    // run over one unreachable number, and failed sends are retried tomorrow.
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron:reminders] run failed", error);
    return NextResponse.json({ error: "reminder run failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
