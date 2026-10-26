import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-surface p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-semibold", className)} {...props} />;
}
