import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-hover",
        secondary: "bg-card text-ink border border-hairline hover:border-brand",
        ghost: "text-ink hover:bg-hairline/60",
        danger: "bg-danger text-white hover:brightness-95",
        success: "bg-success text-white hover:brightness-95",
        link: "text-brand underline underline-offset-4 hover:text-brand-hover",
      },
      size: {
        // 48px floor everywhere: the brief asks for >=48px tap targets.
        md: "min-h-12 px-4 text-[0.9375rem]",
        lg: "min-h-14 px-6 text-base w-full",
        icon: "min-h-12 w-12",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
