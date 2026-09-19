import { Prisma, type NotificationChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { messageChannel, SendError } from "@/lib/messaging";
import { translate } from "@/lib/message-text";

/**
 * The outbox. Producers call `enqueue`, which is a single insert; the cron that
 * calls `flushNotifications` does the sending. Nothing user-facing ever waits
 * on Meta.
 */

/**
 * Our event names. Each one is also the default WhatsApp template name, so a
 * template created in Meta as `leave_approved` needs no configuration at all.
 *
 * Approved and rejected are separate templates rather than one with the
 * decision as a parameter: a template's text is translated by Meta, and an
 * English word dropped into a Gujarati sentence reads like a bug.
 */
export const TEMPLATES = {
  leave_applied: { messageKey: "notify.leaveApplied", params: ["applicant", "leaveType", "from", "days"] },
  leave_approved: { messageKey: "notify.leaveApproved", params: ["leaveType", "from", "note"] },
  leave_rejected: { messageKey: "notify.leaveRejected", params: ["leaveType", "from", "note"] },
  leave_pending: { messageKey: "notify.leavePending", params: ["applicant", "leaveType", "from"] },
  task_assigned: { messageKey: "notify.taskAssigned", params: ["title", "priority", "due"] },
  license_expiry: { messageKey: "notify.licenseExpiry", params: ["name", "expiry", "days"] },
  license_expired: { messageKey: "notify.licenseExpired", params: ["name", "expiry", "days"] },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

/** Give up after this many tries; a queue that never gives up hides the failure. */
export const MAX_ATTEMPTS = 4;

export type EnqueueInput = {
  /** Who it is for. Their locale and opt-out are read from here. */
  userId?: string | null;
  /** Needed when there is no user row, e.g. a contact. */
  toMobile?: string;
  template: TemplateKey;
  /** Values only — never sentences: they go into a template Meta translated. */
  values: Record<string, string | number>;
  /**
   * What makes the producer safe to run twice. Same key, same message: the
   * second call is a no-op rather than a second ping.
   */
  dedupeKey?: string;
  channel?: NotificationChannel;
};

export type EnqueueResult =
  | { queued: true; id?: string }
  | { queued: false; reason: "duplicate" | "no-number" | "opted-out" | "cancelled"; id?: string };

/**
 * Writes one row. Never throws: a notification that cannot be queued must not
 * fail the action that caused it — nobody's leave approval should be lost
 * because a message could not be addressed.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  try {
    const definition = TEMPLATES[input.template];

    const user = input.userId
      ? await prisma.user.findUnique({
          where: { id: input.userId },
          select: { mobile: true, locale: true, whatsappOptOut: true },
        })
      : null;

    const toMobile = input.toMobile ?? user?.mobile;
    if (!toMobile) return { queued: false, reason: "no-number" };

    const channel = input.channel ?? "WHATSAPP";

    // A blank is rejected by Meta as a template parameter, and reads as a
    // mistake in a sentence ("due ", with nothing after it), so an absent value
    // becomes a dash in both the parameters and the text.
    const values = Object.fromEntries(
      Object.entries(input.values).map(([name, value]) => [
        name,
        value === undefined || value === "" ? "—" : value,
      ]),
    );

    const body = translate(user?.locale, definition.messageKey, values);

    // Ordered to match the template's {{1}}, {{2}}, …
    const params = definition.params.map((name) => String(values[name] ?? "—"));

    // Opted out is recorded, not dropped: the log has to be able to answer
    // "why did they not get it?".
    const optedOut = channel === "WHATSAPP" && user?.whatsappOptOut === true;

    const data = {
      channel,
      status: optedOut ? ("CANCELLED" as const) : ("QUEUED" as const),
      toMobile,
      userId: input.userId ?? null,
      template: input.template,
      params,
      body,
      lastError: optedOut ? "recipient opted out of WhatsApp" : null,
      dedupeKey: input.dedupeKey ?? null,
    };

    if (input.dedupeKey) {
      // createMany, not create, so a duplicate is an ON CONFLICT DO NOTHING
      // rather than an exception. Producers are meant to be safe to run twice;
      // a logged constraint violation every time a scheduler retries would bury
      // the failures that do matter.
      const { count } = await prisma.notification.createMany({
        data: [data],
        skipDuplicates: true,
      });
      if (count === 0) return { queued: false, reason: "duplicate" };
      return optedOut ? { queued: false, reason: "opted-out" } : { queued: true };
    }

    const row = await prisma.notification.create({ data, select: { id: true } });
    return optedOut
      ? { queued: false, reason: "opted-out", id: row.id }
      : { queued: true, id: row.id };
  } catch (error) {
    // Still caught: skipDuplicates covers the expected case, and this covers a
    // race between two producers inserting the same key at once.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { queued: false, reason: "duplicate" };
    }
    console.error("[notify] could not queue", input.template, error);
    return { queued: false, reason: "cancelled" };
  }
}

export type FlushSummary = {
  channel: string;
  picked: number;
  sent: number;
  retrying: number;
  failed: number;
  errors: { id: string; reason: string }[];
};

/**
 * Sends what is waiting, oldest first. Called by the external cron, so it is
 * bounded: a run that tried to drain an unbounded queue would hit the host's
 * request timeout and leave everything half-done.
 *
 * Delivery is at-least-once, deliberately. A process that dies between the send
 * and the status write leaves the row queued, so the message may go twice —
 * which is better than a leave approval nobody hears about.
 */
export async function flushNotifications(limit = 40): Promise<FlushSummary> {
  const channel = messageChannel();
  const summary: FlushSummary = {
    channel: channel.name,
    picked: 0,
    sent: 0,
    retrying: 0,
    failed: 0,
    errors: [],
  };

  const queued = await prisma.notification.findMany({
    where: { status: "QUEUED", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  summary.picked = queued.length;

  for (const row of queued) {
    const attempts = row.attempts + 1;

    // Claim the row before sending. cron-job.org will happily start a second
    // run while a slow one is still going, and two runs picking the same row
    // would message somebody twice. This is a compare-and-swap on (status,
    // attempts): whoever bumps it first owns the send, the other skips.
    const claim = await prisma.notification.updateMany({
      where: { id: row.id, status: "QUEUED", attempts: row.attempts },
      data: { attempts },
    });
    if (claim.count === 0) {
      summary.picked -= 1;
      continue;
    }

    try {
      const result = await channel.send({
        toMobile: row.toMobile,
        template: row.template,
        params: Array.isArray(row.params) ? row.params.map(String) : [],
        body: row.body,
      });

      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerRef: result.providerRef ?? null,
          lastError: null,
        },
      });
      summary.sent += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 300) : "unknown";
      // Permanent means retrying cannot help; otherwise it gets the remaining
      // attempts and then stops, so a real failure ends up visible as FAILED.
      const permanent = error instanceof SendError && error.permanent;
      const exhausted = attempts >= MAX_ATTEMPTS;

      await prisma.notification.update({
        where: { id: row.id },
        data: {
          // Back to QUEUED for another run, or FAILED so somebody reads it.
          status: permanent || exhausted ? "FAILED" : "QUEUED",
          lastError: reason,
        },
      });

      if (permanent || exhausted) summary.failed += 1;
      else summary.retrying += 1;
      summary.errors.push({ id: row.id, reason });
    }
  }

  return summary;
}
