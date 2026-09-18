import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { toDateInput, workDateFor } from "@/lib/workday";

/**
 * There is no pg_dump on the host and no shell to run it from, so the backup is
 * a JSON snapshot written by the app itself into App_Data — which IIS does not
 * serve — and collected over FTP.
 *
 * Tables are discovered from the catalogue rather than listed here: a backup
 * that silently stops covering a table added later is worse than no backup.
 */
export type BackupSummary = {
  file: string;
  bytes: number;
  tables: number;
  rows: number;
  /** Tables that hit the row cap, so a partial snapshot can never look complete. */
  truncated: string[];
  skipped: string[];
  removed: string[];
};

/** Rows per table. Generous for this app; a guard against a runaway table. */
const ROW_CAP = 50_000;

/** Snapshots to keep. Older ones are removed after a successful write. */
const KEEP = 7;

/**
 * Transient rows nobody would restore: live sessions (a restore should not hand
 * back a logged-in browser) and one-time codes, which expire in minutes.
 */
const SKIP_TABLES = new Set(["_prisma_migrations", "sessions", "otp_codes"]);

export function backupRoot(): string {
  const configured = process.env.BACKUP_DIR ?? "./App_Data/backups";
  return path.resolve(process.cwd(), configured);
}

/** JSON cannot hold BigInt or bytes; keep both rather than throw or lose them. */
function toJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Uint8Array) return Buffer.from(item).toString("base64");
      return item;
    },
    2,
  );
}

async function publicTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((row) => row.table_name);
}

export async function runBackup(): Promise<BackupSummary> {
  const root = backupRoot();
  await mkdir(root, { recursive: true });

  const all = await publicTables();
  const skipped = all.filter((name) => SKIP_TABLES.has(name));
  const tables = all.filter((name) => !SKIP_TABLES.has(name));

  const data: Record<string, unknown[]> = {};
  const truncated: string[] = [];
  let rows = 0;

  for (const table of tables) {
    // The name comes from the catalogue, not from a request, and is quoted.
    const contents = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${table}" LIMIT ${ROW_CAP + 1}`,
    );
    if (contents.length > ROW_CAP) {
      truncated.push(table);
      contents.length = ROW_CAP;
    }
    data[table] = contents;
    rows += contents.length;
  }

  const takenAt = new Date();
  const body = toJson({
    takenAt: takenAt.toISOString(),
    workDate: toDateInput(workDateFor(takenAt)),
    rowCap: ROW_CAP,
    truncated,
    skipped,
    tables: data,
  });

  // One file per India-local day, overwritten if the day's run repeats — the
  // scheduler retrying must not fill the disk with near-identical snapshots.
  const name = `backup-${toDateInput(workDateFor(takenAt))}.json`;
  const file = path.join(root, name);
  await writeFile(file, body, { encoding: "utf8", mode: 0o600 });
  const written = await stat(file);

  // Prune only after the new snapshot is safely on disk.
  const existing = (await readdir(root))
    .filter((entry) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(entry))
    .sort();
  const removed = existing.slice(0, Math.max(0, existing.length - KEEP));
  for (const entry of removed) await unlink(path.join(root, entry));

  return {
    file: name,
    bytes: written.size,
    tables: tables.length,
    rows,
    truncated,
    skipped,
    removed,
  };
}
