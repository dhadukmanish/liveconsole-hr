import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-xl border px-3 py-2.5 text-sm font-medium", {
  variants: {
    tone: {
      info: "border-hairline bg-card text-ink",
      success: "border-success/30 bg-success/10 text-success",
      warning: "border-pending/40 bg-pending/15 text-[#8a5d00] dark:text-pending",
      danger: "border-danger/30 bg-danger/10 text-danger",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Alert({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role="status" className={cn(alertVariants({ tone }), className)} {...props} />;
}
