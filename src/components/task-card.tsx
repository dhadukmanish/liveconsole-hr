import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { formatDate, workDateFor } from "@/lib/workday";
import { initials } from "@/lib/utils";

export type TaskCardData = {
  id: string;
  title: string;
  priorityName: string;
  priorityColour: string;
  assigneeName: string | null;
  dueDate: Date | null;
  isTerminal: boolean;
};

export async function TaskCard({ task }: { task: TaskCardData }) {
  const t = await getTranslations();
  // Overdue only matters while the task is still open.
  const overdue = Boolean(task.dueDate && !task.isTerminal && task.dueDate < workDateFor());

  return (
    // prefetch={false}: one row in a list, and a list here runs to fifty rows.
    // Nothing prefetches these today — Next only prefetches a dynamic route as
    // far as a loading boundary, and this app has none, for reasons set out in
    // NavProgress. This is here so that the day one is added back, fifty rows
    // do not each fire a request: over http a browser holds six connections to
    // one host, and fifty prefetches do not warm the app, they queue in front
    // of the tap the person actually made. That was measured, not guessed —
    // every row logged net::ERR_ABORTED while a boundary was in place.
    <Link href={`/tasks/${task.id}`} prefetch={false} className="block">
      <article className="rounded-xl border border-hairline bg-card p-3 transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: task.priorityColour }}
          />
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{task.title}</p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{task.priorityName}</Badge>
          {task.dueDate ? (
            <Badge tone={overdue ? "danger" : "neutral"}>
              {overdue ? t("tasks.overdue") : formatDate(task.dueDate)}
            </Badge>
          ) : null}
          {task.assigneeName ? (
            <span className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-[0.6875rem] font-bold text-brand-ink">
              {initials(task.assigneeName)}
            </span>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
