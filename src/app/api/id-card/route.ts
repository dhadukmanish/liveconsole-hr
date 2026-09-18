import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getCurrentUser } from "@/lib/auth/session";
import { canSeeUser } from "@/lib/scope";
import { buildIdCardPdf } from "@/lib/id-card";

/**
 * GET /api/id-card            -> the signed-in user's card
 * GET /api/id-card?userId=... -> someone else's, if permission and scope allow
 */
export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const requested = new URL(request.url).searchParams.get("userId");
  const targetId = requested ?? actor.id;

  if (targetId !== actor.id) {
    if (!can(actor, "USERS", "VIEW") || !(await canSeeUser(actor, targetId))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: { profile: true },
  });
  if (!user) return new NextResponse("Not found", { status: 404 });

  // The QR carries the employee code, so a card without one would be useless.
  const employeeCode = user.profile?.employeeCode;
  if (!employeeCode) {
    return NextResponse.json({ error: "idCard.needsProfile" }, { status: 422 });
  }

  const pdf = await buildIdCardPdf({
    name: user.name,
    designation: user.profile?.designation ?? null,
    department: user.profile?.department ?? null,
    employeeCode,
    mobile: user.mobile,
    photoPath: user.profile?.photoPath ?? null,
  });

  const filename = `id-card-${employeeCode}.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
