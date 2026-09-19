import { NextResponse } from "next/server";
import { cronTokenMatches } from "@/lib/cron-auth";
import { runReminders } from "@/lib/reminders";

/**
 * Shared Windows hosting gives us no scheduler, so an external one
 * (cron-job.org) calls this once a day.
 *
 * GET is supported because most free schedulers can only issue a GET, and the
 * handler is idempotent by design: reminders are queued with a dedupe key
 * carrying the India-local day, so a repeat call inside the same day queues
 * nothing. Sending happens in /api/cron/notifications.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!cronTokenMatches(request)) {
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
