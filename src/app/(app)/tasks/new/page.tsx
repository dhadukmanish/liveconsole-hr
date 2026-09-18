import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { TaskForm } from "@/components/task-form";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { userScopeFilter } from "@/lib/scope";
import { createTaskAction } from "../actions";

export default async function NewTaskPage() {
  const actor = await requirePermissionPage("TASK", "ADD");
  const t = await getTranslations();

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

  return (
    <>
      <PageHeader title={t("tasks.new")} />
      <Card>
        <TaskForm
          action={createTaskAction}
          types={types}
          priorities={priorities}
          statuses={statuses}
          people={people}
          defaults={{ assigneeId: actor.id }}
          submitLabelKey="common.create"
        />
      </Card>
    </>
  );
}
