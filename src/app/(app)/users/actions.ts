"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/guard";
import { generatePassword, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions, type CurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { canSeeUser } from "@/lib/scope";
import { ROLE_ADMIN, ROLE_EMPLOYEE, ROLE_SUPERADMIN } from "@/lib/rbac";
import {
  emailSchema,
  fieldErrors,
  mobileSchema,
  nameSchema,
  optionalText,
  passwordSchema,
} from "@/lib/validation";

export type UserFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  notice?: string;
  /** Shown once after create/reset so the admin can pass it on. */
  generatedPassword?: string;
};

/**
 * Role rank. You may only assign a role strictly below your own, so an ADMIN
 * cannot mint another ADMIN (or a SUPERADMIN) and quietly widen their reach.
 */
const RANK: Record<string, number> = {
  [ROLE_SUPERADMIN]: 3,
  [ROLE_ADMIN]: 2,
  [ROLE_EMPLOYEE]: 1,
};

function rank(roleCode: string) {
  return RANK[roleCode] ?? 0;
}

async function assertCanAssignRole(actor: CurrentUser, roleId: string) {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new Error("errors.invalidInput");
  if (rank(role.code) >= rank(actor.roleCode)) {
    throw new Error("errors.forbidden");
  }
  return role;
}

/** Walk up the proposed reporting line; refuse if we come back to this user. */
async function assertNoManagerCycle(userId: string, managerId: string | null) {
  let cursor = managerId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === userId) throw new Error("users.managerCycle");
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const parent: { managerId: string | null } | null = await prisma.user.findUnique({
      where: { id: cursor },
      select: { managerId: true },
    });
    cursor = parent?.managerId ?? null;
  }
}

const baseUserSchema = z.object({
  name: nameSchema,
  mobile: mobileSchema,
  email: z.union([emailSchema, z.literal("")]).optional(),
  roleId: z.string().min(1, "Choose a role"),
  managerId: z.string().optional(),
  loginMethod: z.enum(["OTP", "PASSWORD"]),
  employeeCode: optionalText(40),
  designation: optionalText(80),
  department: optionalText(80),
});

function readForm(formData: FormData) {
  return {
    name: formData.get("name") ?? "",
    mobile: formData.get("mobile") ?? "",
    email: formData.get("email") ?? "",
    roleId: formData.get("roleId") ?? "",
    managerId: String(formData.get("managerId") ?? ""),
    loginMethod: formData.get("loginMethod") ?? "OTP",
    employeeCode: formData.get("employeeCode") ?? "",
    designation: formData.get("designation") ?? "",
    department: formData.get("department") ?? "",
  };
}

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requirePermission("USERS", "ADD");

  const parsed = baseUserSchema.safeParse(readForm(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  const providedPassword = String(formData.get("initialPassword") ?? "");
  if (input.loginMethod === "PASSWORD" && providedPassword) {
    const check = passwordSchema.safeParse(providedPassword);
    if (!check.success) {
      return { fieldErrors: { initialPassword: check.error.issues[0].message } };
    }
  }

  try {
    await assertCanAssignRole(actor, input.roleId);

    if (await prisma.user.findUnique({ where: { mobile: input.mobile } })) {
      return { fieldErrors: { mobile: "users.mobileTaken" } };
    }

    // A manager you cannot see is a manager you cannot assign.
    const managerId = input.managerId || null;
    if (managerId && !(await canSeeUser(actor, managerId))) {
      return { fieldErrors: { managerId: "errors.forbidden" } };
    }

    const password =
      input.loginMethod === "PASSWORD" ? providedPassword || generatePassword() : null;

    const user = await prisma.user.create({
      data: {
        name: input.name,
        mobile: input.mobile,
        email: input.email ? input.email : null,
        roleId: input.roleId,
        managerId,
        loginMethod: input.loginMethod,
        passwordHash: password ? await hashPassword(password) : null,
        mustChangePassword: Boolean(password),
        createdById: actor.id,
        profile: {
          create: {
            employeeCode: input.employeeCode ?? null,
            designation: input.designation ?? null,
            department: input.department ?? null,
          },
        },
      },
    });

    await writeAudit({
      actorUserId: actor.id,
      action: "USER_CREATED",
      entity: "User",
      entityId: user.id,
      summary: `${user.name} (${user.mobile})`,
    });

    revalidatePath("/users");

    if (password) {
      // Handed back once; it is a bcrypt hash from here on.
      return { notice: "users.created", generatedPassword: password };
    }
    redirect(`/users/${user.id}?created=1`);
  } catch (error) {
    if (error instanceof Error && error.message.includes(".")) {
      return { error: error.message };
    }
    throw error;
  }

  return {};
}

export async function updateUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requirePermission("USERS", "EDIT");
  const userId = String(formData.get("userId") ?? "");

  if (!(await canSeeUser(actor, userId))) return { error: "errors.forbidden" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!target) return { error: "errors.notFound" };

  // Editing someone at or above your own rank is out of bounds.
  if (target.id !== actor.id && rank(target.role.code) >= rank(actor.roleCode)) {
    return { error: "errors.forbidden" };
  }

  const parsed = baseUserSchema.safeParse(readForm(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  try {
    const roleChanged = input.roleId !== target.roleId;
    if (roleChanged) {
      if (target.id === actor.id) return { error: "users.cannotEditSelf" };
      await assertCanAssignRole(actor, input.roleId);
    }

    if (input.mobile !== target.mobile) {
      const clash = await prisma.user.findUnique({ where: { mobile: input.mobile } });
      if (clash && clash.id !== target.id) {
        return { fieldErrors: { mobile: "users.mobileTaken" } };
      }
    }

    const managerId = input.managerId || null;
    if (managerId) {
      if (managerId === target.id) return { fieldErrors: { managerId: "users.managerCycle" } };
      if (!(await canSeeUser(actor, managerId))) {
        return { fieldErrors: { managerId: "errors.forbidden" } };
      }
      await assertNoManagerCycle(target.id, managerId);
    }

    const switchingToPassword =
      input.loginMethod === "PASSWORD" && target.loginMethod !== "PASSWORD";
    const newPassword = switchingToPassword && !target.passwordHash ? generatePassword() : null;

    await prisma.user.update({
      where: { id: target.id },
      data: {
        name: input.name,
        mobile: input.mobile,
        email: input.email ? input.email : null,
        roleId: input.roleId,
        managerId,
        loginMethod: input.loginMethod,
        ...(newPassword
          ? { passwordHash: await hashPassword(newPassword), mustChangePassword: true }
          : {}),
        profile: {
          upsert: {
            create: {
              employeeCode: input.employeeCode ?? null,
              designation: input.designation ?? null,
              department: input.department ?? null,
            },
            update: {
              employeeCode: input.employeeCode ?? null,
              designation: input.designation ?? null,
              department: input.department ?? null,
            },
          },
        },
      },
    });

    await writeAudit({
      actorUserId: actor.id,
      action: "USER_UPDATED",
      entity: "User",
      entityId: target.id,
      summary: input.name,
    });

    revalidatePath("/users");
    revalidatePath(`/users/${target.id}`);

    return newPassword
      ? { notice: "users.updated", generatedPassword: newPassword }
      : { notice: "users.updated" };
  } catch (error) {
    if (error instanceof Error && error.message.includes(".")) {
      return { error: error.message };
    }
    throw error;
  }
}

const statusSchema = z.enum(["ACTIVE", "BLOCKED", "INACTIVE"]);

export async function setUserStatusAction(formData: FormData): Promise<void> {
  const actor = await requirePermission("USERS", "EDIT");
  const userId = String(formData.get("userId") ?? "");
  const parsed = statusSchema.safeParse(formData.get("status"));
  if (!parsed.success) return;

  if (userId === actor.id) return; // no self-lockout
  if (!(await canSeeUser(actor, userId))) return;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!target || rank(target.role.code) >= rank(actor.roleCode)) return;

  await prisma.user.update({ where: { id: userId }, data: { status: parsed.data } });

  // Blocking has to bite immediately, not whenever a token expires.
  if (parsed.data !== "ACTIVE") await revokeAllSessions(userId);

  await writeAudit({
    actorUserId: actor.id,
    action: `USER_${parsed.data}`,
    entity: "User",
    entityId: userId,
    summary: target.name,
  });

  revalidatePath("/users");
  revalidatePath(`/users/${userId}`);
}

export async function resetPasswordAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const actor = await requirePermission("USERS", "EDIT");
  const userId = String(formData.get("userId") ?? "");

  if (!(await canSeeUser(actor, userId))) return { error: "errors.forbidden" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  if (!target) return { error: "errors.notFound" };
  if (target.id !== actor.id && rank(target.role.code) >= rank(actor.roleCode)) {
    return { error: "errors.forbidden" };
  }

  const password = generatePassword();
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      loginMethod: "PASSWORD",
    },
  });
  await revokeAllSessions(userId);

  await writeAudit({
    actorUserId: actor.id,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: userId,
    summary: target.name,
  });

  revalidatePath(`/users/${userId}`);
  return { notice: "users.passwordResetTo", generatedPassword: password };
}
