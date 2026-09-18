"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/guard";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { destroyCurrentSession, revokeAllSessions } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/validation";

export type ChangePasswordState = { error?: string; fieldErrors?: Record<string, string> };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const record = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!record.passwordHash) {
    return { error: "auth.notPasswordUser" };
  }

  if (!(await verifyPassword(current, record.passwordHash))) {
    return { fieldErrors: { currentPassword: "auth.invalidCredentials" } };
  }

  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) {
    return { fieldErrors: { newPassword: parsed.error.issues[0].message } };
  }
  if (next !== confirm) {
    return { fieldErrors: { confirmPassword: "errors.invalidInput" } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next), mustChangePassword: false },
  });

  // Every other device is signed out: a password change has to mean something.
  await revokeAllSessions(user.id);
  await destroyCurrentSession();
  await writeAudit({
    actorUserId: user.id,
    action: "PASSWORD_CHANGED",
    entity: "User",
    entityId: user.id,
  });

  redirect("/login?changed=1");
}
