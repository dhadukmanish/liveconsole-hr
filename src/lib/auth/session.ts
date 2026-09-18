import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PermissionAction, PermissionModule } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE, defaultLocale, isLocale, type Locale } from "@/i18n/locales";
import {
  ROLE_SUPERADMIN,
  effectivePermissions,
  permissionKey,
  type PermissionKey,
} from "@/lib/rbac";

export const SESSION_COOKIE = "lc_session";
export const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CurrentUser = {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  roleId: string;
  roleCode: string;
  roleName: string;
  managerId: string | null;
  locale: Locale;
  themePref: string;
  mustChangePassword: boolean;
  loginMethod: "OTP" | "PASSWORD";
  permissions: Set<PermissionKey>;
  isSuperAdmin: boolean;
  profile: {
    employeeCode: string | null;
    designation: string | null;
    department: string | null;
    photoPath: string | null;
  } | null;
};

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 255),
      ip: meta.ip,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The host may not have SSL on the subdomain yet; an always-secure cookie
    // would lock everyone out over plain HTTP. Flip via SESSION_COOKIE_SECURE.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Resolves the caller from their cookie on every request. Status is re-read from
 * the database each time, which is the whole point of server-side sessions:
 * blocking or deactivating a user takes effect immediately instead of when some
 * token happens to expire.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          permissions: { include: { permission: true } },
          profile: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;

  // Cheap sliding "last seen"; the 30-day expiry itself is fixed.
  if (Date.now() - session.lastSeenAt.getTime() > 3_600_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  const user = session.user;
  const permissions = effectivePermissions({
    roleCode: user.role.code,
    rolePermissions: user.role.permissions.map((row) => ({
      module: row.permission.module,
      action: row.permission.action,
      allowed: row.allowed,
    })),
    userOverrides: user.permissions.map((row) => ({
      module: row.permission.module,
      action: row.permission.action,
      allowed: row.allowed,
    })),
  });

  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    roleId: user.roleId,
    roleCode: user.role.code,
    roleName: user.role.name,
    managerId: user.managerId,
    locale: isLocale(user.locale) ? user.locale : defaultLocale,
    themePref: user.themePref,
    mustChangePassword: user.mustChangePassword,
    loginMethod: user.loginMethod,
    permissions,
    isSuperAdmin: user.role.code === ROLE_SUPERADMIN,
    profile: user.profile
      ? {
          employeeCode: user.profile.employeeCode,
          designation: user.profile.designation,
          department: user.profile.department,
          photoPath: user.profile.photoPath,
        }
      : null,
  };
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
}

/** Used after a password change and after an admin blocks a user. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 86_400,
  });
}

export function can(
  user: CurrentUser | null,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (!user) return false;
  return user.permissions.has(permissionKey(module, action));
}

/** Constant-time compare for anything secret we ever have to match in code. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
