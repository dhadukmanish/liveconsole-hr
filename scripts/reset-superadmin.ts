/**
 * Resets the super admin's password.
 *
 * The seed prints its generated password exactly once. If that scrolled past,
 * digging it out of a CI log is worse than just setting a new one: this revokes
 * every existing session and forces a change at next sign-in, so the printed
 * value is only ever good for one login.
 *
 *   SUPERADMIN_MOBILE=... npm run db:reset-admin
 *
 * Set SUPERADMIN_PASSWORD to choose the password instead of generating one.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

async function main() {
  const mobile = process.env.SUPERADMIN_MOBILE;
  if (!mobile) {
    console.error("SUPERADMIN_MOBILE is not set.");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { mobile },
    include: { role: true },
  });

  if (!user) {
    console.error(`No user with mobile ${mobile}. Has the seed run?`);
    process.exit(1);
  }

  const password = process.env.SUPERADMIN_PASSWORD || generatePassword();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      loginMethod: "PASSWORD",
      mustChangePassword: true,
      status: "ACTIVE",
    },
  });

  // Anything signed in with the old password stops working immediately.
  const revoked = await prisma.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log("");
  console.log("==========================================================");
  console.log(" PASSWORD RESET");
  console.log(` name     : ${user.name}`);
  console.log(` role     : ${user.role.code}`);
  console.log(` mobile   : ${user.mobile}`);
  console.log(` password : ${password}`);
  console.log(` sessions revoked: ${revoked.count}`);
  console.log(" You will be asked to change this at sign-in.");
  console.log("==========================================================");
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
