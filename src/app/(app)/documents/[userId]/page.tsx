import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page";
import { DocumentList } from "@/components/document-list";
import { DocumentUploadForm } from "@/components/document-upload-form";
import { prisma } from "@/lib/prisma";
import { requirePermissionPage } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { canSeeUser } from "@/lib/scope";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/storage";

export default async function DocumentsForUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const actor = await requirePermissionPage("DOCUMENTS", "VIEW");
  const { userId } = await params;
  const t = await getTranslations();

  const isSelf = userId === actor.id;
  if (!isSelf && !(await canSeeUser(actor, userId))) notFound();

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!target) notFound();

  const [types, documents] = await Promise.all([
    prisma.documentType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.document.findMany({
      where: { userId },
      include: { documentType: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={isSelf ? t("documents.myDocuments") : t("documents.ofUser", { name: target.name })}
        subtitle={`${documents.length}`}
      />

      {can(actor, "DOCUMENTS", "ADD") ? (
        <Card className="mb-4">
          <CardTitle className="mb-3">{t("common.upload")}</CardTitle>
          <DocumentUploadForm
            userId={target.id}
            types={types.map((type) => ({
              id: type.id,
              name: type.name,
              requiresNumber: type.requiresNumber,
            }))}
            maxLabel={formatBytes(MAX_UPLOAD_BYTES)}
          />
        </Card>
      ) : null}

      <DocumentList
        documents={documents.map((document) => ({
          id: document.id,
          originalName: document.originalName,
          typeName: document.documentType.name,
          documentNumber: document.documentNumber,
          sizeBytes: document.sizeBytes,
          createdAt: document.createdAt,
        }))}
        canDelete={can(actor, "DOCUMENTS", "DELETE")}
      />
    </>
  );
}
