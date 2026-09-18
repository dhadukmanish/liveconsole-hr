import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page";
import { MasterEditor } from "@/components/master-editor";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import type { MasterKind } from "./actions";

const TABS: { kind: MasterKind; titleKey: string }[] = [
  { kind: "documentType", titleKey: "settings.documentTypes" },
  { kind: "leaveType", titleKey: "settings.leaveTypes" },
  { kind: "taskType", titleKey: "settings.taskTypes" },
  { kind: "taskPriority", titleKey: "settings.taskPriorities" },
  { kind: "taskStatus", titleKey: "settings.taskStatuses" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requirePermissionPage("SETTINGS", "VIEW");
  const t = await getTranslations();
  const { tab } = await searchParams;

  const active = TABS.find((entry) => entry.kind === tab) ?? TABS[0];
  const canEdit = can(actor, "SETTINGS", "EDIT") || can(actor, "SETTINGS", "ADD");
  const canDelete = can(actor, "SETTINGS", "DELETE");

  const [documentTypes, leaveTypes, taskTypes, taskPriorities, taskStatuses] =
    await Promise.all([
      active.kind === "documentType"
        ? prisma.documentType.findMany({ orderBy: { sortOrder: "asc" } })
        : [],
      active.kind === "leaveType"
        ? prisma.leaveType.findMany({ orderBy: { sortOrder: "asc" } })
        : [],
      active.kind === "taskType"
        ? prisma.taskType.findMany({ orderBy: { sortOrder: "asc" } })
        : [],
      active.kind === "taskPriority"
        ? prisma.taskPriority.findMany({ orderBy: { sortOrder: "asc" } })
        : [],
      active.kind === "taskStatus"
        ? prisma.taskStatus.findMany({ orderBy: { sortOrder: "asc" } })
        : [],
    ]);

  return (
    <>
      <PageHeader title={t("settings.title")} />

      <nav className="mb-4 -mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((entry) => (
          <Link
            key={entry.kind}
            href={`/settings?tab=${entry.kind}`}
            className={`flex min-h-12 shrink-0 items-center rounded-xl border px-4 text-sm font-semibold ${
              entry.kind === active.kind
                ? "border-brand bg-brand text-on-brand"
                : "border-hairline bg-card text-ink"
            }`}
          >
            {t(entry.titleKey as "settings.documentTypes")}
          </Link>
        ))}
      </nav>

      {active.kind === "documentType" ? (
        <MasterEditor
          kind="documentType"
          title={t("settings.documentTypes")}
          canEdit={canEdit}
          canDelete={canDelete}
          extras={[
            { name: "requiresNumber", label: t("settings.requiresNumber"), type: "checkbox" },
          ]}
          rows={documentTypes.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
            detail: row.requiresNumber ? t("settings.requiresNumber") : undefined,
          }))}
        />
      ) : null}

      {active.kind === "leaveType" ? (
        <MasterEditor
          kind="leaveType"
          title={t("settings.leaveTypes")}
          canEdit={canEdit}
          canDelete={canDelete}
          extras={[
            { name: "isPaid", label: t("settings.paid"), type: "checkbox" },
            { name: "requiresApproval", label: t("settings.requiresApproval"), type: "checkbox" },
            { name: "annualDays", label: t("settings.annualDays"), type: "number" },
          ]}
          rows={leaveTypes.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
            detail: [
              row.isPaid ? t("settings.paid") : null,
              row.annualDays !== null ? `${row.annualDays} ${t("settings.annualDays")}` : null,
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
      ) : null}

      {active.kind === "taskType" ? (
        <MasterEditor
          kind="taskType"
          title={t("settings.taskTypes")}
          canEdit={canEdit}
          canDelete={canDelete}
          rows={taskTypes.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
          }))}
        />
      ) : null}

      {active.kind === "taskPriority" ? (
        <MasterEditor
          kind="taskPriority"
          title={t("settings.taskPriorities")}
          canEdit={canEdit}
          canDelete={canDelete}
          extras={[{ name: "colour", label: t("settings.colour"), type: "colour" }]}
          rows={taskPriorities.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
            colour: row.colour,
          }))}
        />
      ) : null}

      {active.kind === "taskStatus" ? (
        <MasterEditor
          kind="taskStatus"
          title={t("settings.taskStatuses")}
          canEdit={canEdit}
          canDelete={canDelete}
          extras={[{ name: "colour", label: t("settings.colour"), type: "colour" }]}
          rows={taskStatuses.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            isActive: row.isActive,
            sortOrder: row.sortOrder,
            colour: row.colour,
          }))}
        />
      ) : null}
    </>
  );
}
