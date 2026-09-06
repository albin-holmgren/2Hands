import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--rk-radius)] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--rk-cream)] text-[var(--rk-cream-ink)] hover:opacity-90",
        cream: "bg-[var(--rk-cream)] text-[var(--rk-cream-ink)] hover:opacity-90",
        outline:
          "border border-[var(--rk-hairline-strong)] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]",
        ghost: "text-[var(--rk-body)] hover:bg-[var(--rk-surface-2)]",
        pill: "rounded-full bg-[var(--rk-surface-2)] text-[var(--rk-ink)] hover:bg-[var(--rk-selected)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
