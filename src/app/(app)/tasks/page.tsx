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
  searchParams: Promise<{ mine?: string; status?: string }>;
}) {
  const user = await requirePermissionPage("TASK", "VIEW");
  const t = await getTranslations();
  const { mine, status: statusParam } = await searchParams;
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

  /**
   * On a phone the board shows one column at a time. A five-column board on a
   * 390px screen gave each column 80vw and put the rest off to the right, so
   * the cards were cramped AND you had to swipe sideways through statuses you
   * were not looking at. From 768px there is room for the columns side by
   * side, which is the view this was designed as, so that one is kept.
   *
   * Default to the first column that has anything in it: opening on an empty
   * "To do" while the work sits in "In progress" is a board that looks broken.
   */
  const shown =
    statuses.find((status) => status.code === statusParam) ??
    statuses.find((status) => (byStatus.get(status.id) ?? []).length > 0) ??
    statuses[0];

  const columnHref = (code: string) =>
    `/tasks?status=${encodeURIComponent(code)}${onlyMine ? "&mine=1" : ""}`;

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
          href={shown ? `/tasks?status=${encodeURIComponent(shown.code)}` : "/tasks"}
          className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
            onlyMine ? "border-hairline bg-card text-ink" : "border-brand bg-brand text-on-brand"
          }`}
        >
          {t("tasks.all")}
        </Link>
        <Link
          href={shown ? `/tasks?mine=1&status=${encodeURIComponent(shown.code)}` : "/tasks?mine=1"}
          className={`flex min-h-12 items-center rounded-xl border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
            onlyMine ? "border-brand bg-brand text-on-brand" : "border-hairline bg-card text-ink"
          }`}
        >
          {t("tasks.mine")}
        </Link>
      </div>

      {tasks.length === 0 ? <EmptyState className="mb-4">{t("tasks.none")}</EmptyState> : null}

      {/* The phone's column picker. Every status with its count, so the shape
          of the board is legible without swiping through it. */}
      <div className="lc-scroll-hint -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:hidden">
        {statuses.map((status) => {
          const column = byStatus.get(status.id) ?? [];
          const active = shown?.id === status.id;
          return (
            <Link
              key={status.id}
              href={columnHref(status.code)}
              aria-current={active ? "true" : undefined}
              className={`flex min-h-12 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] ${
                active ? "border-brand bg-brand text-on-brand" : "border-hairline bg-card text-ink"
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: status.colour }}
              />
              {status.name}
              {/* Not text-on-brand/70: the ink colour was picked to clear 4.5:1
                  on this orange, and fading it to 70% spends exactly that
                  margin. Full strength, and the weight does the de-emphasis. */}
              <span className={active ? "font-normal text-on-brand" : "text-muted"}>
                {column.length}
              </span>
            </Link>
          );
        })}
      </div>

      {/* One column per status, always rendered: an empty board should still
          show the workflow. A phone shows the chosen one full width; from
          768px they sit side by side. */}
      <div className="flex flex-col gap-3 md:flex-row">
        {statuses.map((status) => {
            const column = byStatus.get(status.id) ?? [];
            return (
              <section
                key={status.id}
                className={`w-full md:flex-1 ${shown?.id === status.id ? "" : "hidden md:block"}`}
                aria-label={status.name}
              >
                {/* The heading repeats what the chip above says, so on a phone
                    it would be the same words twice. */}
                <div className="mb-2 hidden items-center gap-2 md:flex">
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
                    <p className="py-6 text-center text-sm text-muted">{t("tasks.emptyColumn")}</p>
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
