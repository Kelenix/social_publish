import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-accent-strong focus:outline-none disabled:opacity-60";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-9", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium", className)} {...props} />;
}

export function Hint({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-1 text-xs text-muted", className)} {...props} />;
}
