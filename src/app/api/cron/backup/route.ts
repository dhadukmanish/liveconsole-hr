import { NextResponse } from "next/server";
import { cronTokenMatches } from "@/lib/cron-auth";
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

  try {
    const summary = await runBackup();
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
