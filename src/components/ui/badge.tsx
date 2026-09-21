import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A small piece of state next to the thing it describes.
 *
 * The treatment is the boilerplate's: a tenth-strength fill, a quarter-strength
 * border of the same tone, and the text in the tone itself. The border is what
 * makes these read as labels rather than as coloured smudges, which matters on
 * a list where several sit side by side.
 *
 * It keeps 12px text rather than the boilerplate's 11px. Eleven works in a
 * desktop table read at arm's length; the brief for this app sets a floor
 * because it is read on a phone, outdoors, by people who are not all in their
 * twenties.
 *
 * `info` is new and is what a role should use. A role is not an action and not
 * a status, and wearing the brand orange put it in competition with the one
 * button on screen that actually does something.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-hairline bg-muted/10 text-muted",
        brand: "border-brand/25 bg-brand/10 text-brand-ink",
        info: "border-info/25 bg-info/10 text-info-ink",
        success: "border-success/25 bg-success/10 text-success-ink",
        pending: "border-pending/30 bg-pending/10 text-pending-ink",
        danger: "border-danger/25 bg-danger/10 text-danger-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
