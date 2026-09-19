import { NextResponse } from "next/server";
import { cronTokenMatches } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-log";
import { runBackup } from "@/lib/backup";

/**
 * Called weekly by the same external scheduler as the reminders. Writes a JSON
 * snapshot into App_Data/backups, which IIS does not serve; collect the files
 * over FTP.
 */
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  if (!cronTokenMatches(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // A diagnostic call is not the scheduler. Without this, the deploy's own
  // health check would keep the Notifications screen saying the scheduler is
  // alive when no cron job exists at all — the one thing that screen is for.
  const probe = new URL(request.url).searchParams.get("probe") === "1";

  try {
    const summary = await runBackup();
    if (!probe) await recordCronRun("backup", `${summary.file}, ${summary.rows} rows`);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    // A failed backup must be loud: a scheduler that only watches the status
    // code is the only thing that will ever notice.
    console.error("[cron:backup] run failed", error);
    return NextResponse.json({ error: "backup failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
