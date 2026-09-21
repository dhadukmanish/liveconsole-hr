"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A bar across the top of the screen from the moment a link is tapped until the
 * next screen is on it.
 *
 * Every screen here is rendered on a server whose database is on another
 * machine, so a tap always waits on a round trip — from a phone in India, a few
 * hundred milliseconds of it. The complaint was never the wait. It was that
 * nothing acknowledged the tap: the old screen simply stayed until the new one
 * replaced it, so the app felt like it had missed the press.
 *
 * The obvious answer is a route loading.tsx, and it was tried twice. Both times
 * it broke the thing that matters more: after a server action, the screen
 * stopped refreshing. Uploading a document wrote the row and left the list
 * empty; approving leave decided it and left it pending; moving a task moved it
 * and left the badge behind. Each was confirmed against the database — the
 * write landed, the screen did not follow. Feedback is worth a lot, but not
 * that.
 *
 * So this reads the tap itself, in the capture phase, before the router sees
 * it. One component in the layout covers every link in the app, with no
 * per-link changes to forget. The bar clears when the address changes, which is
 * the moment the new screen commits, and after eight seconds regardless, so a
 * navigation that never happens cannot leave it running forever.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);

  // Arrival. Search params count: the filter chips change only those.
  useEffect(() => setBusy(false), [pathname, search]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const next = new URL(link.href, location.href);
      if (next.origin !== location.origin) return;
      // The download and PDF routes hand back a file; the screen does not change.
      if (next.pathname.startsWith("/api/")) return;
      if (next.pathname + next.search === location.pathname + location.search) return;

      setBusy(true);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setBusy(false), 8000);
    return () => clearTimeout(timer);
  }, [busy]);

  if (!busy) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-brand/20"
    >
      <div className="lc-progress h-full w-1/3 rounded-full bg-brand" />
    </div>
  );
}
