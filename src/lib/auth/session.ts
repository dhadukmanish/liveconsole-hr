import { cache } from "react";
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
/** The shape the one identity query returns. */
type SessionRow = {
  sessionId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  roleId: string;
  managerId: string | null;
  locale: string;
  themePref: string;
  mustChangePassword: boolean;
  loginMethod: "OTP" | "PASSWORD";
  status: string;
  roleCode: string;
  roleName: string;
  employeeCode: string | null;
  designation: string | null;
  department: string | null;
  photoPath: string | null;
  rolePermissions: { module: PermissionModule; action: PermissionAction; allowed: boolean }[] | null;
  userOverrides: { module: PermissionModule; action: PermissionAction; allowed: boolean }[] | null;
};

/**
 * Resolves the caller from their cookie on every request. Status is re-read from
 * the database each time, which is the whole point of server-side sessions:
 * blocking or deactivating a user takes effect immediately instead of when some
 * token happens to expire.
 *
 * One query, deliberately. Prisma's nested include for the same data issued
 * seven — session, user, role, role permissions, the permission catalogue, the
 * user's overrides, the profile — and this runs on every page and every action.
 * Against a database on the same machine that is free; against the host's,
 * which is not, it was most of the wait before a screen appeared at all.
 *
 * This is the uncached read. getCurrentUser below memoises it for rendering.
 */
export async function readCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT
      s.id            AS "sessionId",
      s."expiresAt",
      s."revokedAt",
      s."lastSeenAt",
      u.id, u.name, u.mobile, u.email, u."roleId", u."managerId",
      u.locale, u."themePref", u."mustChangePassword",
      u."loginMethod"::text AS "loginMethod",
      u.status::text        AS "status",
      r.code AS "roleCode",
      r.name AS "roleName",
      p."employeeCode", p.designation, p.department, p."photoPath",
      (
        SELECT json_agg(json_build_object(
          'module', pm.module, 'action', pm.action, 'allowed', rp.allowed))
        FROM role_permissions rp
        JOIN permissions pm ON pm.id = rp."permissionId"
        WHERE rp."roleId" = u."roleId"
      ) AS "rolePermissions",
      (
        SELECT json_agg(json_build_object(
          'module', pm.module, 'action', pm.action, 'allowed', up.allowed))
        FROM user_permissions up
        JOIN permissions pm ON pm.id = up."permissionId"
        WHERE up."userId" = u.id
      ) AS "userOverrides"
    FROM sessions s
    JOIN users u ON u.id = s."userId"
    JOIN roles r ON r.id = u."roleId"
    LEFT JOIN employee_profiles p ON p."userId" = u.id
    WHERE s."tokenHash" = ${hashToken(token)}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
  if (row.status !== "ACTIVE") return null;

  // Cheap sliding "last seen"; the 30-day expiry itself is fixed. Not awaited:
  // nothing on the page depends on it, and it is one more round trip.
  if (Date.now() - row.lastSeenAt.getTime() > 3_600_000) {
    void prisma.session
      .update({ where: { id: row.sessionId }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  const permissions = effectivePermissions({
    roleCode: row.roleCode,
    rolePermissions: row.rolePermissions ?? [],
    userOverrides: row.userOverrides ?? [],
  });

  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    email: row.email,
    roleId: row.roleId,
    roleCode: row.roleCode,
    roleName: row.roleName,
    managerId: row.managerId,
    locale: isLocale(row.locale) ? row.locale : defaultLocale,
    themePref: row.themePref,
    mustChangePassword: row.mustChangePassword,
    loginMethod: row.loginMethod,
    permissions,
    isSuperAdmin: row.roleCode === ROLE_SUPERADMIN,
    // A row with no profile still joins; the columns are simply null.
    profile: row.employeeCode || row.designation || row.department || row.photoPath
      ? {
          employeeCode: row.employeeCode,
          designation: row.designation,
          department: row.department,
          photoPath: row.photoPath,
        }
      : null,
  };
}

/**
 * The memoised version, for rendering. A layout and the page inside it both ask
 * who is signed in; this makes that one query.
 *
 * Server actions must NOT use it, and call readCurrentUser directly instead.
 * A Server Action and the re-render that follows its revalidate happen inside
 * the same request, so the memo survives across the two: an action that reads
 * the user, changes that user's own row and revalidates would hand the fresh
 * render the row as it was before the change. Switching the language did
 * exactly that — the database said Gujarati and the screen stayed English.
 */
export const getCurrentUser = cache(readCurrentUser);

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
