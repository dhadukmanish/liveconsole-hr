"use client";

import { useLinkStatus } from "next/link";

/**
 * A bar that appears on the tab you just pressed, for as long as the next
 * screen is on its way.
 *
 * Every screen here is rendered on a server whose database is on another
 * machine, so a tap always waits on a round trip. The complaint was never the
 * wait itself — it was that nothing acknowledged the tap, so the app felt like
 * it had missed it.
 *
 * The obvious fix, a route-level loading.tsx, turned out to cost far more than
 * it gave: with one in place a server action's revalidate stopped refreshing
 * the screen, so checking in, switching language, approving leave all changed
 * the database and left the old page on screen until a manual reload. This does
 * the same job from inside the link, and changes nothing about how the app
 * renders.
 *
 * Must be rendered as a child of a <Link>; useLinkStatus reads that link's
 * pending state and nothing else.
 */
export function NavPending({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-3 top-0 h-0.5 animate-pulse rounded-full bg-brand ${className}`}
    />
  );
}
