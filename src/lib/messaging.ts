import { smsProvider } from "@/lib/sms";
import { toWhatsAppNumber } from "@/lib/phone";

/**
 * One outbound message, ready to send. `template` is our event name; the
 * WhatsApp channel maps it to an approved Meta template, and the SMS and
 * console channels just send `body`.
 */
export type OutboundMessage = {
  toMobile: string;
  template: string;
  params: string[];
  body: string;
};

export type SendResult = { providerRef?: string; detail: string };

/**
 * Whether retrying could ever help. Retrying "this template does not exist"
 * forever buries the one failure somebody needs to read.
 */
export class SendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "SendError";
  }
}

export interface MessageChannel {
  readonly name: string;
  send(message: OutboundMessage): Promise<SendResult>;
}

/** Development, and any deployment not configured yet: write it down, send nothing. */
const consoleChannel: MessageChannel = {
  name: "console",
  async send(message) {
    console.log(
      `[notify:console] ${message.template} -> ${message.toMobile}: ${message.body}`,
    );
    return { detail: "logged to server console" };
  },
};

const smsChannel: MessageChannel = {
  name: "sms",
  async send(message) {
    const provider = smsProvider();
    const result = await provider.sendText(message.toMobile, message.body);
    return { detail: `${provider.name}: ${result.detail}` };
  },
};

/**
 * Meta error codes worth giving up on. Everything not listed is treated as
 * worth another go, because the common failures — rate limits, a 500 from
 * Graph, a dropped connection — all clear on their own.
 */
const PERMANENT_META_CODES = new Set([
  131026, // not a WhatsApp user / undeliverable
  131047, // outside the 24-hour window and no template would apply
  131051, // unsupported message type
  132000, // template parameter count mismatch
  132001, // template does not exist in this language
  132005, // translated text too long
  132007, // template format mismatch
  132012, // parameter format mismatch
  132015, // template paused
  132016, // template disabled
  132068, // flow is blocked
  133010, // number not registered
]);

function templateNameFor(template: string): string {
  // Per-template override, e.g. WHATSAPP_TEMPLATE_LEAVE_DECISION=leave_v3.
  const override = process.env[`WHATSAPP_TEMPLATE_${template.toUpperCase()}`];
  return override && override.trim() !== "" ? override.trim() : template;
}

/** True when the Cloud API has what it needs to send anything at all. */
export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * One place that talks to Graph, so the OTP send and the notification send
 * cannot drift apart on version, timeout or error classification.
 */
async function postToGraph(body: unknown): Promise<{ providerRef?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    // Config, not delivery: retry once somebody sets it, do not discard.
    throw new SendError(
      "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set",
      false,
    );
  }

  const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
  // Overridable so the login path can be exercised against a stub; production
  // never sets it.
  const base = process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com";

  let response: Response;
  try {
    response = await fetch(
      `${base}/${version}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        // Graph occasionally hangs. The cron run that drains the outbox has to
        // end, and somebody waiting on a login code will not wait forever.
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    throw new SendError(
      `could not reach Graph: ${error instanceof Error ? error.message : "unknown"}`,
      false,
    );
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const metaError = (parsed as { error?: { message?: string; code?: number } } | null)?.error;
    const code = metaError?.code;
    throw new SendError(
      `Graph ${response.status}${code ? ` (${code})` : ""}: ${
        metaError?.message ?? text.slice(0, 200)
      }`,
      code !== undefined && PERMANENT_META_CODES.has(code),
    );
  }

  return {
    providerRef: (parsed as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id,
  };
}

/**
 * A login code over WhatsApp. Meta puts these in their own "authentication"
 * template category, with the code as the single body parameter and a button
 * that lets the person copy it without retyping — so this cannot reuse the
 * notification path, which sends utility templates with no buttons.
 *
 * WHATSAPP_OTP_BUTTON matches whatever was approved: copy_code (the default and
 * the easiest to get approved), url for one-tap autofill, or none.
 */
export async function sendWhatsAppOtp(mobile: string, code: string): Promise<{ providerRef?: string }> {
  const to = toWhatsAppNumber(mobile);
  if (!to) throw new SendError(`${mobile} cannot be a WhatsApp number`, true);

  const language = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";
  const button = (process.env.WHATSAPP_OTP_BUTTON ?? "copy_code").toLowerCase();

  const components: unknown[] = [
    { type: "body", parameters: [{ type: "text", text: code }] },
  ];

  // The code goes into the button too: that is what makes copy and one-tap work.
  if (button === "copy_code") {
    components.push({
      type: "button",
      sub_type: "copy_code",
      index: "0",
      parameters: [{ type: "coupon_code", coupon_code: code }],
    });
  } else if (button === "url") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }

  return postToGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_OTP_TEMPLATE?.trim() || "login_code",
      language: { code: language },
      components,
    },
  });
}

const whatsappChannel: MessageChannel = {
  name: "whatsapp",
  async send(message) {
    const to = toWhatsAppNumber(message.toMobile);
    if (!to) {
      // No amount of retrying turns a landline into a WhatsApp number.
      throw new SendError(`${message.toMobile} cannot be a WhatsApp number`, true);
    }

    const language = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";

    const { providerRef } = await postToGraph({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateNameFor(message.template),
        language: { code: language },
        components: [
          {
            type: "body",
            parameters: message.params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    });

    return { providerRef, detail: "accepted by WhatsApp Cloud API" };
  },
};

/**
 * Which channel is live. NOTIFY_CHANNEL wins; otherwise it is inferred from
 * what is configured, so a deployment with nothing set writes to the log
 * instead of failing every send.
 */
export function messageChannel(): MessageChannel {
  const configured = (process.env.NOTIFY_CHANNEL ?? "").toLowerCase();
  if (configured === "whatsapp") return whatsappChannel;
  if (configured === "sms") return smsChannel;
  if (configured === "console") return consoleChannel;

  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return whatsappChannel;
  }
  if ((process.env.SMS_PROVIDER ?? "").toLowerCase() === "msg91") return smsChannel;
  return consoleChannel;
}

/** Exported for tests, which must not depend on environment guesswork. */
export const channels = { consoleChannel, smsChannel, whatsappChannel };
