import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { TaskForm } from "@/components/task-form";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { userScopeFilter } from "@/lib/scope";
import { whatsappHref } from "@/lib/phone";
import { formatDate, toDateInput, workDateFor } from "@/lib/workday";
import { canSeeTask, deleteTaskAction, moveTaskAction, updateTaskAction } from "../actions";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePermissionPage("TASK", "VIEW");
  const { id } = await params;
  const t = await getTranslations();

  if (!(await canSeeTask(actor, id))) notFound();

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      taskPriority: true,
      taskStatus: true,
      taskType: true,
      assignee: { select: { id: true, name: true, mobile: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!task) notFound();

  const editable = can(actor, "TASK", "EDIT");
  const scope = await userScopeFilter(actor);

  const [types, priorities, statuses, people] = await Promise.all([
    prisma.taskType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.taskPriority.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.taskStatus.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { ...scope, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const overdue = Boolean(
    task.dueDate && !task.taskStatus.isTerminal && task.dueDate < workDateFor(),
  );

  // No point offering to message yourself, or somebody with no mobile we can
  // reach on WhatsApp.
  const chatLink =
    task.assignee && task.assignee.id !== actor.id
      ? whatsappHref(
          task.assignee.mobile,
          `${task.title}${task.dueDate ? ` (${t("tasks.due")}: ${formatDate(task.dueDate)})` : ""}`,
        )
      : null;

  return (
    <>
      <PageHeader
        title={task.title}
        subtitle={t("tasks.raisedBy", { name: task.createdBy.name })}
        action={<Badge tone="neutral">{task.taskStatus.name}</Badge>}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{task.taskPriority.name}</Badge>
          {task.taskType ? <Badge tone="neutral">{task.taskType.name}</Badge> : null}
          {task.dueDate ? (
            <Badge tone={overdue ? "danger" : "neutral"}>
              {t("tasks.due")}: {formatDate(task.dueDate)}
            </Badge>
          ) : null}
          <Badge tone="brand">
            {task.assignee?.name ?? t("tasks.unassigned")}
          </Badge>
        </div>

        {task.description ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{task.description}</p>
        ) : (
          <CardMuted className="mt-3">{t("tasks.noDescription")}</CardMuted>
        )}

        {/* Click-to-chat, not the API: this works from a phone today, with no
            business account, and opens a real conversation rather than a
            one-way template. The queued notification is the automatic half. */}
        {chatLink ? (
          <a
            href={chatLink}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl border border-hairline px-4 text-sm font-semibold text-success-ink hover:border-brand"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            {t("notify.sendOnWhatsapp")}
          </a>
        ) : null}
      </Card>

      {/* One tap per column, which beats a drag target on a phone. */}
      {editable ? (
        <Card className="mb-4">
          <CardTitle className="mb-2">{t("tasks.moveTo")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {statuses
              .filter((status) => status.id !== task.taskStatusId)
              .map((status) => (
                <form key={status.id} action={moveTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="taskStatusId" value={status.id} />
                  <Button type="submit" variant="secondary">
                    {status.name}
                  </Button>
                </form>
              ))}
          </div>
        </Card>
      ) : null}

      {editable ? (
        <Card className="mb-4">
          <CardTitle className="mb-3">{t("common.edit")}</CardTitle>
          <TaskForm
            action={updateTaskAction}
            types={types}
            priorities={priorities}
            statuses={statuses}
            people={people}
            defaults={{
              id: task.id,
              title: task.title,
              description: task.description,
              taskTypeId: task.taskTypeId,
              taskPriorityId: task.taskPriorityId,
              taskStatusId: task.taskStatusId,
              assigneeId: task.assigneeId,
              dueDate: task.dueDate ? toDateInput(task.dueDate) : "",
            }}
            submitLabelKey="common.save"
          />
        </Card>
      ) : null}

      {can(actor, "TASK", "DELETE") ? (
        <form action={deleteTaskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <Button type="submit" variant="ghost" className="text-danger-ink">
            {t("tasks.delete")}
          </Button>
        </form>
      ) : null}
    </>
  );
}
