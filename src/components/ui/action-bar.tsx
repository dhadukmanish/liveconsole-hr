import type * as React from "react";

/**
 * The submit control of a long form, docked to the bottom of a phone screen.
 *
 * What this replaces was `sticky bottom-20` with a translucent, blurred
 * background. Three things were wrong with it, and all three were visible:
 * it floated with a 20px transparent gap between itself and the tab bar, so
 * the list scrolled through that gap; the backdrop blur let the cards behind
 * show through the bar itself; and because a sticky element can only be pushed
 * within its own parent, it came unstuck at the end of the form and dropped
 * 53px — a jump, on the last screen of every save.
 *
 * Docked, none of that can happen: the bar is in the same place at every
 * scroll position, it is opaque, and it sits flush on the tab bar so the two
 * read as one piece of furniture. The spacer keeps the last row of the form
 * scrollable clear of it.
 *
 * From 768px there is room for the button where it was written, so the dock
 * goes away entirely rather than pinning a bar across a desktop window.
 *
 * Note for anything else that wants `position: fixed` inside a page: an
 * ancestor with a transform becomes its containing block. That is why the
 * screen-entrance animation is a fade and no longer a 6px rise.
 */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Height of the bar above the tab bar, so nothing hides under it. */}
      <div aria-hidden className="h-20 md:hidden" />
      <div
        className={
          "fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-card px-4 pt-3 " +
          // The tab bar's own height, plus whatever the phone reserves below it.
          "pb-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] " +
          "md:static md:mt-4 md:border-0 md:bg-transparent md:p-0"
        }
      >
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>
    </>
  );
}
