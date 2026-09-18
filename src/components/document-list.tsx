import { getTranslations } from "next-intl/server";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardMuted } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { deleteDocumentAction } from "@/app/(app)/documents/actions";
import { formatBytes } from "@/lib/storage";

export type DocumentRow = {
  id: string;
  originalName: string;
  typeName: string;
  documentNumber: string | null;
  sizeBytes: number;
  createdAt: Date;
};

export async function DocumentList({
  documents,
  canDelete,
}: {
  documents: DocumentRow[];
  canDelete: boolean;
}) {
  const t = await getTranslations();

  if (documents.length === 0) {
    return <EmptyState>{t("documents.noDocuments")}</EmptyState>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {documents.map((document) => (
        <li key={document.id}>
          <Card className="flex items-center gap-3">
            <FileText className="h-6 w-6 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{document.typeName}</p>
              <CardMuted className="truncate">
                {document.originalName} · {formatBytes(document.sizeBytes)}
              </CardMuted>
              {document.documentNumber ? (
                <Badge tone="neutral" className="mt-1">
                  {document.documentNumber}
                </Badge>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <a
                href={`/api/documents/${document.id}/file`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center rounded-xl border border-hairline px-3 text-sm font-semibold text-ink hover:border-brand"
              >
                {t("common.download")}
              </a>
              {canDelete ? (
                <form action={deleteDocumentAction}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <Button type="submit" variant="ghost" className="text-danger">
                    {t("common.delete")}
                  </Button>
                </form>
              ) : null}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
