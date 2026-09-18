/** Digits only, so a stored "+91 98250-12345" still dials. */
function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function telHref(phone: string): string {
  // Keep a leading + if the record has one; it matters for international dialling.
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return `tel:${plus}${digits(trimmed)}`;
}

/**
 * wa.me needs a full international number, so this is deliberately strict: a
 * wrong link opens a chat with a stranger. A bare 10-digit Indian mobile gets
 * 91; an explicitly international number is trusted as written. Everything else
 * — landlines with an STD code, extensions, half-typed numbers — gets no link,
 * because "0281 2345678" is not a WhatsApp number in any country.
 */
export function whatsappHref(phone: string): string | null {
  const raw = digits(phone);

  if (/^[6-9]\d{9}$/.test(raw)) return `https://wa.me/91${raw}`;
  if (/^91[6-9]\d{9}$/.test(raw)) return `https://wa.me/${raw}`;
  // A written-out + is the author saying "this is the full international number".
  if (phone.trim().startsWith("+") && raw.length >= 11 && raw.length <= 15) {
    return `https://wa.me/${raw}`;
  }
  return null;
}
