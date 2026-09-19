/**
 * SMS delivery behind an interface so the OTP flow never depends on a provider.
 * Dev uses "console"; production switches SMS_PROVIDER to "msg91".
 */
export type SmsResult = { delivered: boolean; detail: string };

export interface SmsProvider {
  readonly name: string;
  /** True when the OTP may be echoed back to the browser (development only). */
  readonly exposesCodeToClient: boolean;
  sendOtp(mobile: string, code: string): Promise<SmsResult>;
  /**
   * A plain notification, not a login code. Kept separate from sendOtp because
   * an Indian provider routes the two through different DLT-registered
   * templates: a reminder pushed through an OTP template is rejected or
   * mangled, and an OTP pushed through a promotional route may not arrive.
   */
  sendText(mobile: string, message: string): Promise<SmsResult>;
}

const consoleProvider: SmsProvider = {
  name: "console",
  exposesCodeToClient: true,
  async sendOtp(mobile, code) {
    console.log(`[sms:console] OTP for ${mobile} is ${code}`);
    return { delivered: true, detail: "logged to server console" };
  },
  async sendText(mobile, message) {
    console.log(`[sms:console] text for ${mobile}: ${message}`);
    return { delivered: true, detail: "logged to server console" };
  },
};

const msg91Provider: SmsProvider = {
  name: "msg91",
  exposesCodeToClient: false,
  async sendOtp(mobile, code) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_TEMPLATE_ID;

    if (!authKey || !templateId) {
      // Fail loudly rather than silently dropping a login code.
      throw new Error(
        "MSG91_AUTH_KEY and MSG91_TEMPLATE_ID must be set when SMS_PROVIDER=msg91",
      );
    }

    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        template_id: templateId,
        sender: process.env.MSG91_SENDER_ID,
        recipients: [{ mobiles: `91${mobile}`, OTP: code }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`MSG91 responded ${response.status}: ${body.slice(0, 200)}`);
    }

    return { delivered: true, detail: "queued with MSG91" };
  },

  async sendText(mobile, message) {
    const authKey = process.env.MSG91_AUTH_KEY;
    const templateId = process.env.MSG91_REMINDER_TEMPLATE_ID;

    // Refusing is the safe outcome: the reminder is retried tomorrow, whereas
    // borrowing the OTP template would send something the operator never
    // registered — and would train people to ignore login codes.
    if (!authKey || !templateId) {
      throw new Error(
        "MSG91_AUTH_KEY and MSG91_REMINDER_TEMPLATE_ID must be set to send reminders by SMS",
      );
    }

    const response = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        sender: process.env.MSG91_SENDER_ID,
        recipients: [{ mobiles: `91${mobile}`, MESSAGE: message }],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`MSG91 responded ${response.status}: ${body.slice(0, 200)}`);
    }

    return { delivered: true, detail: "queued with MSG91" };
  },
};

export function smsProvider(): SmsProvider {
  const configured = (process.env.SMS_PROVIDER ?? "console").toLowerCase();
  if (configured === "msg91") return msg91Provider;
  return consoleProvider;
}

/**
 * Whether the DEV OTP banner may be shown. Tied to the provider, not to
 * NODE_ENV alone, so a misconfigured production box cannot leak codes to the UI.
 */
export function canRevealOtp(): boolean {
  return smsProvider().exposesCodeToClient && process.env.NODE_ENV !== "production";
}

/**
 * Whether a code can actually reach the person. The console provider in
 * production writes to a log file nobody signing in can read, and telling them
 * "OTP sent to your mobile" in that state leaves them waiting for a text that
 * is never coming.
 */
export function canDeliverOtp(): boolean {
  return !(smsProvider().exposesCodeToClient && process.env.NODE_ENV === "production");
}
