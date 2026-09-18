import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
/** Throttle: one new code per this many seconds per user. */
export const OTP_RESEND_SECONDS = 30;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: "throttled"; retryAfterSeconds: number };

export async function issueOtp(userId: string, ip?: string): Promise<IssueResult> {
  const latest = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (elapsed < OTP_RESEND_SECONDS) {
      return {
        ok: false,
        reason: "throttled",
        retryAfterSeconds: Math.ceil(OTP_RESEND_SECONDS - elapsed),
      };
    }
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  // Any earlier unconsumed code is void once a new one is issued, so two live
  // codes can never both work.
  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpCode.create({
      data: { userId, codeHash: hashCode(code), expiresAt, ip },
    }),
  ]);

  return { ok: true, code, expiresAt };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "mismatch" };

export async function verifyOtp(userId: string, code: string): Promise<VerifyResult> {
  const record = await prisma.otpCode.findFirst({
    where: { userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return { ok: false, reason: "no_code" };

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "expired" };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  if (record.codeHash !== hashCode(code)) {
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    // Burn the code once the attempt budget is spent.
    if (updated.attempts >= OTP_MAX_ATTEMPTS) {
      await prisma.otpCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: false, reason: "mismatch" };
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
