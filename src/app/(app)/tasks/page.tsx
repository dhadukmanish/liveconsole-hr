import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { TaskCard } from "@/components/task-card";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { taskScopeFilter } from "./actions";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ mine?: string }>;
}) {
  const user = await requirePermissionPage("TASK", "VIEW");
  const t = await getTranslations();
  const { mine } = await searchParams;
  const onlyMine = mine === "1";

  const [statuses, tasks] = await Promise.all([
    prisma.taskStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.task.findMany({
      where: {
        ...(await taskScopeFilter(user)),
        ...(onlyMine ? { assigneeId: user.id } : {}),
      },
      include: {
        taskPriority: true,
        taskStatus: true,
        assignee: { select: { name: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 300,
    }),
  ]);

  const byStatus = new Map(statuses.map((status) => [status.id, [] as typeof tasks]));
  for (const task of tasks) byStatus.get(task.taskStatusId)?.push(task);

  return (
    <>
      <PageHeader
        title={t("nav.task")}
        subtitle={t("tasks.count", { count: tasks.length })}
        action={
          can(user, "TASK", "ADD") ? (
            <Link href="/tasks/new" className={buttonVariants({ variant: "primary" })}>
              <Plus className="h-5 w-5" aria-hidden />
              {t("tasks.new")}
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex gap-2">
        <Link
          href="/tasks"
          className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold ${
            onlyMine ? "border-hairline bg-card text-ink" : "border-brand bg-brand text-on-brand"
          }`}
        >
          {t("tasks.all")}
        </Link>
        <Link
          href="/tasks?mine=1"
          className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold ${
            onlyMine ? "border-brand bg-brand text-on-brand" : "border-hairline bg-card text-ink"
          }`}
        >
          {t("tasks.mine")}
        </Link>
      </div>

      {tasks.length === 0 ? <EmptyState className="mb-4">{t("tasks.none")}</EmptyState> : null}

      {/* One column per status, always rendered: an empty board should still
          show the workflow. On a phone it scrolls sideways with snap points;
          from 768px the columns sit side by side. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {statuses.map((status) => {
            const column = byStatus.get(status.id) ?? [];
            return (
              <section
                key={status.id}
                className="w-[80vw] shrink-0 snap-start sm:w-64 md:w-full md:flex-1"
                aria-label={status.name}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: status.colour }}
                  />
                  <h2 className="text-sm font-bold text-ink">{status.name}</h2>
                  <span className="ml-auto text-xs font-semibold text-muted">
                    {column.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2 rounded-card bg-hairline/40 p-2">
                  {column.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">{t("tasks.emptyColumn")}</p>
                  ) : (
                    column.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={{
                          id: task.id,
                          title: task.title,
                          priorityName: task.taskPriority.name,
                          priorityColour: task.taskPriority.colour,
                          assigneeName: task.assignee?.name ?? null,
                          dueDate: task.dueDate,
                          isTerminal: task.taskStatus.isTerminal,
                        }}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
      </div>
    </>
  );
}
