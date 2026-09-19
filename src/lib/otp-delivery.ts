import { SendError, sendWhatsAppOtp, whatsappConfigured } from "@/lib/messaging";
import { smsProvider } from "@/lib/sms";

/**
 * Getting a login code to somebody, right now.
 *
 * This deliberately does not use the notifications outbox: that is drained by a
 * cron job every fifteen minutes, and a login code that arrives a quarter of an
 * hour late is worse than useless — the person has already given up, and the
 * code has expired.
 */
export type OtpDelivery = {
  via: "whatsapp" | "sms" | "console";
  /** False when the code only reached a log file nobody signing in can read. */
  delivered: boolean;
  detail: string;
};

type Preference = "whatsapp" | "sms";

/**
 * OTP_CHANNEL decides; unset means WhatsApp when it is configured, because
 * that is cheaper than SMS in India and the reason to set it up at all.
 */
function preference(): Preference {
  const configured = (process.env.OTP_CHANNEL ?? "").toLowerCase();
  if (configured === "whatsapp") return "whatsapp";
  if (configured === "sms") return "sms";
  return whatsappConfigured() ? "whatsapp" : "sms";
}

async function overSms(mobile: string, code: string): Promise<OtpDelivery> {
  const provider = smsProvider();
  const result = await provider.sendOtp(mobile, code);
  return {
    via: provider.exposesCodeToClient ? "console" : "sms",
    delivered: !provider.exposesCodeToClient,
    detail: `${provider.name}: ${result.detail}`,
  };
}

/**
 * Sends the code, preferring WhatsApp and falling back to SMS.
 *
 * The fallback is not optional: plenty of numbers are not on WhatsApp, and Meta
 * only says so when you try. Falling back on a transient failure too is
 * deliberate — somebody is waiting at a login screen, and a second attempt in
 * fifteen seconds does them no good.
 */
export async function deliverOtp(mobile: string, code: string): Promise<OtpDelivery> {
  if (preference() === "whatsapp") {
    try {
      const { providerRef } = await sendWhatsAppOtp(mobile, code);
      return {
        via: "whatsapp",
        delivered: true,
        detail: providerRef ? `whatsapp: ${providerRef}` : "whatsapp: accepted",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      // Worth a line in the log either way: a permanent failure means that
      // number will always need SMS, and a transient one is worth noticing if
      // it keeps happening.
      console.warn(
        `[otp] WhatsApp delivery failed (${
          error instanceof SendError && error.permanent ? "permanent" : "temporary"
        }), falling back to SMS: ${reason}`,
      );
    }
  }

  return overSms(mobile, code);
}
