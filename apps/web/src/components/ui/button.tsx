import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-accent/85",
        secondary: "border border-border bg-surface hover:bg-surface-muted",
        ghost: "hover:bg-surface-muted",
        danger: "border border-danger/40 text-danger hover:bg-danger/10",
      },
      size: { sm: "h-8 px-3", md: "h-9 px-4", icon: "size-9" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
