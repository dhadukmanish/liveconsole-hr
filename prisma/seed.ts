/**
 * Idempotent seed: roles, the permission catalogue, role defaults, the document
 * and leave/task masters, and one SUPERADMIN.
 *
 * Re-running never clobbers live data — permissions already edited through the
 * UI are left alone, and an existing SUPERADMIN keeps their password.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ACTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MODULES,
  ROLE_ADMIN,
  ROLE_EMPLOYEE,
  ROLE_SUPERADMIN,
} from "../src/lib/rbac";

const prisma = new PrismaClient();

const ROLES = [
  {
    code: ROLE_SUPERADMIN,
    name: "Super admin",
    description: "Full access to every module and every record.",
    sortOrder: 1,
  },
  {
    code: ROLE_ADMIN,
    name: "Admin",
    description: "Manages their own team, recursively by reporting line.",
    sortOrder: 2,
  },
  {
    code: ROLE_EMPLOYEE,
    name: "Employee",
    description: "Sees and manages only their own records.",
    sortOrder: 3,
  },
];

const DOCUMENT_TYPES = [
  { code: "AADHAAR", name: "Aadhaar card", requiresNumber: true, sortOrder: 1 },
  { code: "PAN", name: "PAN card", requiresNumber: true, sortOrder: 2 },
  { code: "PHOTO", name: "Passport photo", requiresNumber: false, sortOrder: 3 },
  { code: "RESUME", name: "Resume", requiresNumber: false, sortOrder: 4 },
  { code: "EDUCATION", name: "Education certificate", requiresNumber: false, sortOrder: 5 },
  { code: "BANK", name: "Bank passbook / cheque", requiresNumber: true, sortOrder: 6 },
  { code: "DRIVING_LICENCE", name: "Driving licence", requiresNumber: true, sortOrder: 7 },
  { code: "OTHER", name: "Other", requiresNumber: false, sortOrder: 99 },
];

const LEAVE_TYPES = [
  { code: "CL", name: "Casual leave", isPaid: true, annualDays: 12, sortOrder: 1 },
  { code: "SL", name: "Sick leave", isPaid: true, annualDays: 6, sortOrder: 2 },
  { code: "EL", name: "Earned leave", isPaid: true, annualDays: 15, sortOrder: 3 },
  { code: "LWP", name: "Leave without pay", isPaid: false, annualDays: null, sortOrder: 4 },
  { code: "COMP_OFF", name: "Compensatory off", isPaid: true, annualDays: null, sortOrder: 5 },
];

const TASK_TYPES = [
  { code: "GENERAL", name: "General", sortOrder: 1 },
  { code: "SITE_VISIT", name: "Site visit", sortOrder: 2 },
  { code: "SUPPORT", name: "Support call", sortOrder: 3 },
  { code: "INSTALLATION", name: "Installation", sortOrder: 4 },
  { code: "FOLLOW_UP", name: "Follow up", sortOrder: 5 },
];

const TASK_PRIORITIES = [
  { code: "LOW", name: "Low", colour: "#1D9E75", sortOrder: 1 },
  { code: "MEDIUM", name: "Medium", colour: "#FBB03B", sortOrder: 2 },
  { code: "HIGH", name: "High", colour: "#F7941D", sortOrder: 3 },
  { code: "URGENT", name: "Urgent", colour: "#E8412C", sortOrder: 4 },
];

const TASK_STATUSES = [
  { code: "TODO", name: "To do", colour: "#6B6A65", sortOrder: 1, isTerminal: false },
  { code: "IN_PROGRESS", name: "In progress", colour: "#F7941D", sortOrder: 2, isTerminal: false },
  { code: "ON_HOLD", name: "On hold", colour: "#FBB03B", sortOrder: 3, isTerminal: false },
  { code: "DONE", name: "Done", colour: "#1D9E75", sortOrder: 4, isTerminal: true },
  { code: "CANCELLED", name: "Cancelled", colour: "#E8412C", sortOrder: 5, isTerminal: true },
];

function randomPassword(length = 12): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function main() {
  // --- roles -------------------------------------------------------------
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, sortOrder: role.sortOrder },
      create: { ...role, isSystem: true },
    });
  }
  console.log(`roles: ${ROLES.length}`);

  // --- permission catalogue ---------------------------------------------
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action },
      });
    }
  }
  const permissions = await prisma.permission.findMany();
  console.log(`permissions: ${permissions.length}`);

  // --- role defaults ----------------------------------------------------
  // `update: {}` on purpose: if an admin has already tuned a role in the UI,
  // re-seeding must not reset their choice.
  let created = 0;
  for (const [roleCode, grants] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) continue;

    for (const permission of permissions) {
      const allowed = grants[permission.module]?.includes(permission.action) ?? false;
      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      });
      if (!existing) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: permission.id, allowed },
        });
        created += 1;
      }
    }
  }
  console.log(`role permission rows created: ${created}`);

  // --- masters ----------------------------------------------------------
  for (const type of DOCUMENT_TYPES) {
    await prisma.documentType.upsert({
      where: { code: type.code },
      update: { name: type.name, requiresNumber: type.requiresNumber, sortOrder: type.sortOrder },
      create: type,
    });
  }
  for (const type of LEAVE_TYPES) {
    await prisma.leaveType.upsert({
      where: { code: type.code },
      update: { name: type.name, isPaid: type.isPaid, annualDays: type.annualDays, sortOrder: type.sortOrder },
      create: type,
    });
  }
  for (const type of TASK_TYPES) {
    await prisma.taskType.upsert({ where: { code: type.code }, update: { name: type.name }, create: type });
  }
  for (const priority of TASK_PRIORITIES) {
    await prisma.taskPriority.upsert({
      where: { code: priority.code },
      update: { name: priority.name, colour: priority.colour },
      create: priority,
    });
  }
  for (const status of TASK_STATUSES) {
    await prisma.taskStatus.upsert({
      where: { code: status.code },
      update: { name: status.name, colour: status.colour, isTerminal: status.isTerminal },
      create: status,
    });
  }
  console.log(
    `masters: ${DOCUMENT_TYPES.length} document types, ${LEAVE_TYPES.length} leave types, ` +
      `${TASK_TYPES.length} task types, ${TASK_PRIORITIES.length} priorities, ${TASK_STATUSES.length} statuses`,
  );

  // --- superadmin -------------------------------------------------------
  const mobile = process.env.SUPERADMIN_MOBILE;
  if (!mobile) {
    console.warn("SUPERADMIN_MOBILE is not set — skipping the super admin.");
    return;
  }

  const superRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE_SUPERADMIN } });
  const existing = await prisma.user.findUnique({ where: { mobile } });

  if (existing) {
    // Never silently reset a live password.
    await prisma.user.update({
      where: { id: existing.id },
      data: { roleId: superRole.id, status: "ACTIVE" },
    });
    console.log(`super admin ${mobile} already exists — password left untouched`);
  } else {
    const password = process.env.SUPERADMIN_PASSWORD ?? randomPassword();
    const user = await prisma.user.create({
      data: {
        mobile,
        name: process.env.SUPERADMIN_NAME ?? "Super Admin",
        email: process.env.SUPERADMIN_EMAIL ?? null,
        roleId: superRole.id,
        loginMethod: "PASSWORD",
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
        status: "ACTIVE",
        locale: "en",
        profile: {
          create: {
            employeeCode: "EMP001",
            designation: "Director",
            department: "Management",
            dateOfJoining: new Date(),
          },
        },
      },
    });

    console.log("");
    console.log("==========================================================");
    console.log(" SUPER ADMIN CREATED");
    console.log(` mobile   : ${user.mobile}`);
    console.log(` password : ${password}`);
    console.log(" You will be asked to change this at first sign-in.");
    console.log("==========================================================");
    console.log("");
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
