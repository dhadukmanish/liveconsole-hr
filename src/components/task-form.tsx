"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { TaskState } from "@/app/(app)/tasks/actions";

export type Option = { id: string; name: string };

export type TaskDefaults = {
  id?: string;
  title?: string;
  description?: string | null;
  taskTypeId?: string | null;
  taskPriorityId?: string;
  taskStatusId?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
};

export function TaskForm({
  action,
  types,
  priorities,
  statuses,
  people,
  defaults = {},
  submitLabelKey,
}: {
  action: (state: TaskState, formData: FormData) => Promise<TaskState>;
  types: Option[];
  priorities: Option[];
  statuses: Option[];
  people: Option[];
  defaults?: TaskDefaults;
  submitLabelKey: string;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<TaskState, FormData>(action, {});

  return (
    <form action={formAction}>
      {defaults.id ? <input type="hidden" name="taskId" value={defaults.id} /> : null}

      {state.error ? (
        <Alert tone="danger" className="mb-3">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3">
          {t(state.notice as "tasks.saved")}
        </Alert>
      ) : null}

      <Field label={t("tasks.title")} htmlFor="title">
        <Input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={160}
          defaultValue={defaults.title ?? ""}
        />
      </Field>

      <Field label={t("tasks.description")} htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          defaultValue={defaults.description ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("tasks.assignee")} htmlFor="assigneeId">
          <Select id="assigneeId" name="assigneeId" defaultValue={defaults.assigneeId ?? ""}>
            <option value="">{t("tasks.unassigned")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("tasks.due")} htmlFor="dueDate">
          <Input id="dueDate" name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} />
        </Field>

        <Field label={t("tasks.type")} htmlFor="taskTypeId">
          <Select id="taskTypeId" name="taskTypeId" defaultValue={defaults.taskTypeId ?? ""}>
            <option value="">—</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("tasks.priority")} htmlFor="taskPriorityId">
          <Select
            id="taskPriorityId"
            name="taskPriorityId"
            required
            defaultValue={defaults.taskPriorityId ?? priorities[1]?.id ?? priorities[0]?.id ?? ""}
          >
            {priorities.map((priority) => (
              <option key={priority.id} value={priority.id}>
                {priority.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("tasks.status")} htmlFor="taskStatusId">
        <Select
          id="taskStatusId"
          name="taskStatusId"
          required
          defaultValue={defaults.taskStatusId ?? statuses[0]?.id ?? ""}
        >
          {statuses.map((status) => (
            <option key={status.id} value={status.id}>
              {status.name}
            </option>
          ))}
        </Select>
      </Field>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("common.loading") : t(submitLabelKey as "common.save")}
      </Button>
    </form>
  );
}
