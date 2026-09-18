"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { can, type CurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { visibleUserIds } from "@/lib/scope";
import { fromDateInput } from "@/lib/workday";

export type TaskState = { error?: string; notice?: string };

/**
 * A task is visible if you are its assignee, you raised it, or the person it
 * belongs to is inside your data scope. Permission decides whether the screen
 * opens; this decides which rows it shows.
 */
export async function taskScopeFilter(actor: CurrentUser) {
  const ids = await visibleUserIds(actor);
  if (ids === "ALL") return {};
  return {
    OR: [
      { assigneeId: { in: ids } },
      { createdById: { in: ids } },
      { assigneeId: null, createdById: actor.id },
    ],
  };
}

export async function canSeeTask(actor: CurrentUser, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...(await taskScopeFilter(actor)) },
  });
  return task;
}

const taskSchema = z.object({
  title: z.string().trim().min(3, "tasks.titleTooShort").max(160),
  description: z.string().trim().max(2000).optional(),
  taskTypeId: z.string().optional(),
  taskPriorityId: z.string().min(1, "errors.invalidInput"),
  taskStatusId: z.string().min(1, "errors.invalidInput"),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

function readForm(formData: FormData) {
  return {
    title: formData.get("title") ?? "",
    description: String(formData.get("description") ?? "").trim() || undefined,
    taskTypeId: String(formData.get("taskTypeId") ?? "") || undefined,
    taskPriorityId: formData.get("taskPriorityId") ?? "",
    taskStatusId: formData.get("taskStatusId") ?? "",
    assigneeId: String(formData.get("assigneeId") ?? "") || undefined,
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
  };
}

/** Assigning work to someone you cannot see would hide the task from you. */
async function assertAssignable(actor: CurrentUser, assigneeId: string | undefined) {
  if (!assigneeId) return null;
  const ids = await visibleUserIds(actor);
  if (ids !== "ALL" && !ids.includes(assigneeId)) return "errors.forbidden";
  return null;
}

export async function createTaskAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const actor = await requirePermission("TASK", "ADD");

  const parsed = taskSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message.includes(".") ? message : "errors.invalidInput" };
  }
  const input = parsed.data;

  const forbidden = await assertAssignable(actor, input.assigneeId);
  if (forbidden) return { error: forbidden };

  const dueDate = input.dueDate ? fromDateInput(input.dueDate) : null;
  if (input.dueDate && !dueDate) return { error: "errors.invalidInput" };

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      taskTypeId: input.taskTypeId ?? null,
      taskPriorityId: input.taskPriorityId,
      taskStatusId: input.taskStatusId,
      // Unassigned work tends to be nobody's work, so default to the creator.
      assigneeId: input.assigneeId ?? actor.id,
      createdById: actor.id,
      dueDate,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "TASK_CREATED",
    entity: "Task",
    entityId: task.id,
    summary: task.title,
  });

  revalidatePath("/tasks");
  revalidatePath("/home");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(
  _prev: TaskState,
  formData: FormData,
): Promise<TaskState> {
  const actor = await requirePermission("TASK", "EDIT");
  const taskId = String(formData.get("taskId") ?? "");

  const existing = await canSeeTask(actor, taskId);
  if (!existing) return { error: "errors.notFound" };

  const parsed = taskSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const message = parsed.error.issues[0].message;
    return { error: message.includes(".") ? message : "errors.invalidInput" };
  }
  const input = parsed.data;

  const forbidden = await assertAssignable(actor, input.assigneeId);
  if (forbidden) return { error: forbidden };

  const dueDate = input.dueDate ? fromDateInput(input.dueDate) : null;
  const status = await prisma.taskStatus.findUnique({ where: { id: input.taskStatusId } });

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: input.title,
      description: input.description ?? null,
      taskTypeId: input.taskTypeId ?? null,
      taskPriorityId: input.taskPriorityId,
      taskStatusId: input.taskStatusId,
      assigneeId: input.assigneeId ?? null,
      dueDate,
      // Completion is derived from the status rather than tracked separately,
      // so a task moved back out of Done stops counting as finished.
      completedAt: status?.isTerminal ? (existing.completedAt ?? new Date()) : null,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "TASK_UPDATED",
    entity: "Task",
    entityId: taskId,
    summary: input.title,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/home");
  return { notice: "tasks.saved" };
}

/** The board's one-tap move, kept separate from the full edit form. */
export async function moveTaskAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("TASK", "EDIT");
  const taskId = String(formData.get("taskId") ?? "");
  const taskStatusId = String(formData.get("taskStatusId") ?? "");

  const existing = await canSeeTask(actor, taskId);
  if (!existing) return;

  const status = await prisma.taskStatus.findUnique({ where: { id: taskStatusId } });
  if (!status || !status.isActive) return;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      taskStatusId,
      completedAt: status.isTerminal ? (existing.completedAt ?? new Date()) : null,
    },
  });

  await writeAudit({
    actorUserId: actor.id,
    action: "TASK_MOVED",
    entity: "Task",
    entityId: taskId,
    summary: status.name,
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/home");
}

export async function deleteTaskAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("TASK", "DELETE");
  const taskId = String(formData.get("taskId") ?? "");

  const existing = await canSeeTask(actor, taskId);
  if (!existing) return;

  await prisma.task.delete({ where: { id: taskId } });
  await writeAudit({
    actorUserId: actor.id,
    action: "TASK_DELETED",
    entity: "Task",
    entityId: taskId,
    summary: existing.title,
  });

  revalidatePath("/tasks");
  revalidatePath("/home");
  redirect("/tasks");
}

/** Used by Home: what is on this person's plate right now. */
export async function myOpenTasks(userId: string, limit = 5) {
  return prisma.task.findMany({
    where: { assigneeId: userId, taskStatus: { isTerminal: false } },
    include: { taskStatus: true, taskPriority: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: limit,
  });
}

export { can };
