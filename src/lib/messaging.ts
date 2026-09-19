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

const whatsappChannel: MessageChannel = {
  name: "whatsapp",
  async send(message) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) {
      // Config, not delivery: retry once somebody sets it, do not discard.
      throw new SendError(
        "WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set",
        false,
      );
    }

    const to = toWhatsAppNumber(message.toMobile);
    if (!to) {
      // No amount of retrying turns a landline into a WhatsApp number.
      throw new SendError(`${message.toMobile} cannot be a WhatsApp number`, true);
    }

    const version = process.env.WHATSAPP_API_VERSION ?? "v21.0";
    const language = process.env.WHATSAPP_TEMPLATE_LANG ?? "en";

    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
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
          }),
          // The cron call that drains the outbox has to end; Graph occasionally
          // hangs, and a hung fetch would hold the whole run open.
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

    const providerRef = (parsed as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
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
