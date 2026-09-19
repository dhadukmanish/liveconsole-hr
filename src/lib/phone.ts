/** Digits only, so a stored "+91 98250-12345" still dials. */
function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * The number in the form WhatsApp wants: international, no plus, no spaces.
 * Returns null when it cannot be one, which is the difference between "we did
 * not message them" and "we messaged the wrong person".
 */
export function toWhatsAppNumber(phone: string): string | null {
  const raw = digits(phone);
  if (/^[6-9]\d{9}$/.test(raw)) return `91${raw}`;
  if (/^91[6-9]\d{9}$/.test(raw)) return raw;
  if (phone.trim().startsWith("+") && raw.length >= 11 && raw.length <= 15) return raw;
  return null;
}

export function telHref(phone: string): string {
  // Keep a leading + if the record has one; it matters for international dialling.
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return `tel:${plus}${digits(trimmed)}`;
}

/**
 * A click-to-chat link, with an optional pre-filled message. Deliberately
 * strict: a wrong link opens a chat with a stranger. A bare 10-digit Indian
 * mobile gets 91; an explicitly international number is trusted as written.
 * Everything else — landlines with an STD code, extensions, half-typed numbers
 * — gets no link, because "0281 2345678" is not a WhatsApp number anywhere.
 */
export function whatsappHref(phone: string, text?: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${number}${query}`;
}
