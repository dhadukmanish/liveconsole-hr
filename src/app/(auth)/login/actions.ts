"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, setLocaleCookie } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { issueOtp, verifyOtp } from "@/lib/auth/otp";
import { canDeliverOtp, canRevealOtp, smsProvider } from "@/lib/sms";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/audit";
import { mobileSchema, otpSchema } from "@/lib/validation";
import { defaultLocale, isLocale } from "@/i18n/locales";

export type LoginState = {
  step: "mobile" | "password" | "otp";
  mobile?: string;
  error?: string;
  notice?: string;
  /** Only ever populated by the console SMS provider outside production. */
  devOtp?: string;
};

async function requestMeta() {
  const headerList = await headers();
  return {
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}

/** Step 1: which sign-in method does this mobile use? */
export async function startLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = mobileSchema.safeParse(formData.get("mobile") ?? "");
  if (!parsed.success) {
    return { step: "mobile", error: "auth.invalidCredentials" };
  }
  const mobile = parsed.data;
  const { ip } = await requestMeta();

  const limit = rateLimit(`login:start:${ip ?? "unknown"}`, 20, 300);
  if (!limit.allowed) return { step: "mobile", mobile, error: "auth.rateLimited" };

  const user = await prisma.user.findUnique({ where: { mobile } });

  // Unknown numbers get the same message as a wrong password, so the login form
  // cannot be used to enumerate who works here.
  if (!user) return { step: "mobile", mobile, error: "auth.invalidCredentials" };
  if (user.status === "BLOCKED") return { step: "mobile", mobile, error: "auth.accountBlocked" };
  if (user.status === "INACTIVE") return { step: "mobile", mobile, error: "auth.accountInactive" };

  if (user.loginMethod === "PASSWORD") {
    return { step: "password", mobile };
  }

  const issued = await issueOtp(user.id, ip);
  if (!issued.ok) {
    return { step: "otp", mobile, error: "auth.rateLimited" };
  }

  try {
    await smsProvider().sendOtp(mobile, issued.code);
  } catch (error) {
    console.error("[login] OTP delivery failed", error);
    return { step: "mobile", mobile, error: "errors.unexpected" };
  }

  // The step is still "otp": an administrator can read the code out of the
  // host's log and pass it on, so the box stays usable. What changes is that we
  // stop claiming a text was sent when none can arrive.
  if (!canDeliverOtp()) {
    return { step: "otp", mobile, error: "auth.otpUndeliverable" };
  }

  return {
    step: "otp",
    mobile,
    notice: "auth.otpSent",
    devOtp: canRevealOtp() ? issued.code : undefined,
  };
}

export async function resendOtp(prev: LoginState, formData: FormData): Promise<LoginState> {
  return startLogin({ step: "mobile" }, formData ?? new FormData());
}

async function completeLogin(userId: string, locale: string) {
  const { ip, userAgent } = await requestMeta();
  await createSession(userId, { ip, userAgent });
  await setLocaleCookie(isLocale(locale) ? locale : defaultLocale);
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  await writeAudit({ actorUserId: userId, action: "LOGIN", entity: "User", entityId: userId, ip });
}

export async function loginWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const mobileParsed = mobileSchema.safeParse(formData.get("mobile") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!mobileParsed.success || password.length === 0) {
    return { step: "password", error: "auth.invalidCredentials", mobile: String(formData.get("mobile") ?? "") };
  }
  const mobile = mobileParsed.data;

  const limit = rateLimit(`login:password:${mobile}`, 10, 300);
  if (!limit.allowed) return { step: "password", mobile, error: "auth.rateLimited" };

  const user = await prisma.user.findUnique({ where: { mobile } });
  if (!user || !user.passwordHash) {
    return { step: "password", mobile, error: "auth.invalidCredentials" };
  }
  if (user.loginMethod !== "PASSWORD") {
    return { step: "otp", mobile, error: "auth.notPasswordUser" };
  }
  if (user.status === "BLOCKED") return { step: "password", mobile, error: "auth.accountBlocked" };
  if (user.status === "INACTIVE") return { step: "password", mobile, error: "auth.accountInactive" };

  if (!(await verifyPassword(password, user.passwordHash))) {
    return { step: "password", mobile, error: "auth.invalidCredentials" };
  }

  resetRateLimit(`login:password:${mobile}`);
  await completeLogin(user.id, user.locale);
  redirect("/home");
}

export async function loginWithOtp(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const mobileParsed = mobileSchema.safeParse(formData.get("mobile") ?? "");
  const codeParsed = otpSchema.safeParse(formData.get("code") ?? "");
  const mobile = mobileParsed.success ? mobileParsed.data : String(formData.get("mobile") ?? "");

  if (!mobileParsed.success) return { step: "mobile", error: "auth.invalidCredentials" };
  if (!codeParsed.success) return { step: "otp", mobile, error: "auth.invalidOtp" };

  const limit = rateLimit(`login:otp:${mobile}`, 15, 300);
  if (!limit.allowed) return { step: "otp", mobile, error: "auth.rateLimited" };

  const user = await prisma.user.findUnique({ where: { mobile: mobileParsed.data } });
  if (!user) return { step: "mobile", mobile, error: "auth.invalidCredentials" };
  if (user.status === "BLOCKED") return { step: "otp", mobile, error: "auth.accountBlocked" };
  if (user.status === "INACTIVE") return { step: "otp", mobile, error: "auth.accountInactive" };

  const result = await verifyOtp(user.id, codeParsed.data);
  if (!result.ok) {
    const message =
      result.reason === "expired" || result.reason === "no_code"
        ? "auth.otpExpired"
        : result.reason === "too_many_attempts"
          ? "auth.tooManyAttempts"
          : "auth.invalidOtp";
    return { step: "otp", mobile, error: message };
  }

  await completeLogin(user.id, user.locale);
  redirect("/home");
}

/**
 * Single entry point for the form: one useActionState hook on the client, with
 * the step carried in a hidden `intent` field.
 */
export async function loginAction(
  prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Checked before `intent`: the resend button lives inside the OTP-step form,
  // whose hidden intent field would otherwise win and turn a resend into a
  // verify with an empty code.
  if (formData.get("resend") !== null) {
    return startLogin(prev, formData);
  }

  const intent = String(formData.get("intent") ?? "start");
  if (intent === "password") return loginWithPassword(prev, formData);
  if (intent === "otp") return loginWithOtp(prev, formData);
  return startLogin(prev, formData);
}
