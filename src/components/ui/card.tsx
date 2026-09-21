import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // A card is told apart from the page by its border and its shadow, not
        // by being a different colour — which is how the boilerplate does it,
        // and why the surfaces can stay neutral.
        "rounded-card border border-hairline bg-card p-4 shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-bold text-ink", className)} {...props} />;
}

export function CardMuted({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}
