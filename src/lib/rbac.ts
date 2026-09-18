import type { PermissionAction, PermissionModule } from "@prisma/client";

export const MODULES: PermissionModule[] = [
  "TASK",
  "ATTENDANCE",
  "LEAVE",
  "DOCUMENTS",
  "PHONEBOOK",
  "LICENSES",
  "USERS",
  "SETTINGS",
];

export const ACTIONS: PermissionAction[] = [
  "VIEW",
  "ADD",
  "EDIT",
  "DELETE",
  "APPROVE",
];

export const ROLE_SUPERADMIN = "SUPERADMIN";
export const ROLE_ADMIN = "ADMIN";
export const ROLE_EMPLOYEE = "EMPLOYEE";

export type PermissionKey = `${PermissionModule}:${PermissionAction}`;

export function permissionKey(
  module: PermissionModule,
  action: PermissionAction,
): PermissionKey {
  return `${module}:${action}`;
}

/**
 * Defaults written into role_permissions by the seed. Changing these does not
 * retro-edit an existing database — the Permissions screen does that.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  string,
  Partial<Record<PermissionModule, PermissionAction[]>>
> = {
  [ROLE_SUPERADMIN]: Object.fromEntries(
    MODULES.map((module) => [module, ACTIONS]),
  ) as Record<PermissionModule, PermissionAction[]>,

  [ROLE_ADMIN]: {
    TASK: ["VIEW", "ADD", "EDIT", "DELETE", "APPROVE"],
    ATTENDANCE: ["VIEW", "ADD", "EDIT", "APPROVE"],
    LEAVE: ["VIEW", "ADD", "EDIT", "APPROVE"],
    DOCUMENTS: ["VIEW", "ADD", "EDIT", "DELETE"],
    PHONEBOOK: ["VIEW", "ADD", "EDIT"],
    LICENSES: ["VIEW", "ADD", "EDIT"],
    USERS: ["VIEW", "ADD", "EDIT"],
    SETTINGS: ["VIEW"],
  },

  [ROLE_EMPLOYEE]: {
    TASK: ["VIEW", "ADD", "EDIT"],
    ATTENDANCE: ["VIEW", "ADD"],
    LEAVE: ["VIEW", "ADD"],
    DOCUMENTS: ["VIEW", "ADD"],
    PHONEBOOK: ["VIEW"],
    LICENSES: ["VIEW"],
  },
};

/**
 * Role defaults, then per-user overrides on top. SUPERADMIN is unconditional:
 * the brief says it cannot be restricted, so no override can lock them out of
 * the screen that manages overrides.
 */
export function effectivePermissions(input: {
  roleCode: string;
  rolePermissions: { module: PermissionModule; action: PermissionAction; allowed: boolean }[];
  userOverrides: { module: PermissionModule; action: PermissionAction; allowed: boolean }[];
}): Set<PermissionKey> {
  if (input.roleCode === ROLE_SUPERADMIN) {
    return new Set(
      MODULES.flatMap((module) => ACTIONS.map((action) => permissionKey(module, action))),
    );
  }

  const result = new Set<PermissionKey>();
  for (const row of input.rolePermissions) {
    if (row.allowed) result.add(permissionKey(row.module, row.action));
  }
  for (const row of input.userOverrides) {
    const key = permissionKey(row.module, row.action);
    if (row.allowed) result.add(key);
    else result.delete(key);
  }
  return result;
}

/** Module is visible in navigation only if the user can at least VIEW it. */
export function visibleModules(permissions: Set<PermissionKey>): PermissionModule[] {
  return MODULES.filter((module) => permissions.has(permissionKey(module, "VIEW")));
}
