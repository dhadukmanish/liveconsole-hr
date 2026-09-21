import { Skeleton } from "@/components/ui/skeleton";

/**
 * What the content area shows between the tap and the screen.
 *
 * Every screen here is rendered on a server whose database is on a different
 * machine, so a tap always waits on a round trip. Without a loading boundary
 * two things go wrong at once: the old screen stays on display until the new
 * one is ready, so a tap looks like it was missed; and Next has nothing to
 * prefetch for a dynamic route, so the wait starts when you tap rather than
 * when the link came into view.
 *
 * There was one of these before and it was taken out, because with it in place
 * a server action's revalidate stopped refreshing the screen. That turned out
 * to be a different bug — the actions were reading identity through a
 * per-request memo that outlived the action and fed the revalidate render a
 * stale user. Actions read it uncached now, and the language switch, check-in
 * and leave approval flows were re-run against this file to confirm it.
 *
 * The shell — the tab bar, the sidebar, the page frame — is the layout, and a
 * layout survives a soft navigation, so only this area changes.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="mb-1 h-7 w-48" />
      <Skeleton className="mb-5 h-4 w-32" />
      <Skeleton className="mb-3 h-28 rounded-card" />
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
      <Skeleton className="h-20 rounded-card" />
    </div>
  );
}
