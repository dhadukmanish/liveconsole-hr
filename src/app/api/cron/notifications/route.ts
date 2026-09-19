import { NextResponse } from "next/server";
import { cronTokenMatches } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-log";
import { flushNotifications } from "@/lib/notify";

/**
 * Drains the outbox. This is the only thing that talks to WhatsApp, so it is
 * the only thing that can be slow, and it runs on the external scheduler
 * rather than in anybody's request.
 *
 * Call it as often as you like — every fifteen minutes is reasonable. It only
 * ever sends what is queued, and it is bounded per run so it cannot outlast the
 * host's request timeout.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!cronTokenMatches(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const parsed = Number(limitParam);
  const limit = Number.isInteger(parsed) && parsed > 0 && parsed <= 200 ? parsed : 40;

  try {
    const summary = await flushNotifications(limit);
    await recordCronRun(
      "notifications",
      `${summary.channel}: sent ${summary.sent}, retrying ${summary.retrying}, failed ${summary.failed}`,
    );
    // Individual send failures are reported inside the summary, not as a 500:
    // one bad number must not make the scheduler retry the whole batch.
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron:notifications] flush failed", error);
    return NextResponse.json({ error: "flush failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
