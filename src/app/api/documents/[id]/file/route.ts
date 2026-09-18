import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { can, getCurrentUser } from "@/lib/auth/session";
import { canSeeUser } from "@/lib/scope";
import { readStoredFile, sanitiseDisplayName } from "@/lib/storage";

/**
 * Documents are streamed through this route rather than served as static files:
 * an Aadhaar scan on a public path is readable by anyone who learns the URL.
 * Every request re-checks the session, the permission and the data scope.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return new NextResponse("Not found", { status: 404 });

  const isOwner = document.userId === user.id;
  if (!isOwner) {
    if (!can(user, "DOCUMENTS", "VIEW")) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (!(await canSeeUser(user, document.userId))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  let file;
  try {
    file = await readStoredFile(document.storedPath);
  } catch (error) {
    console.error("[documents] file missing on disk", document.id, error);
    return new NextResponse("Not found", { status: 404 });
  }

  const filename = sanitiseDisplayName(document.originalName);
  const body = Readable.toWeb(file.stream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(body, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Length": String(file.size),
      // `inline` lets a phone preview a PDF instead of forcing a download.
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
