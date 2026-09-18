import { timingSafeEqual } from "node:crypto";

/**
 * The cron routes are public URLs — an external scheduler has to reach them —
 * so CRON_SECRET is the only thing in front of them.
 */
export function cronTokenMatches(request: Request): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  const supplied = suppliedToken(request);

  // No secret configured means the endpoint stays shut rather than wide open.
  if (!expected || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function suppliedToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  // Query parameter too: most free schedulers can only issue a plain GET.
  return new URL(request.url).searchParams.get("token");
}
