import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-caption font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-status-completed-border bg-status-completed-bg text-status-completed",
        destructive: "border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled",
        outline: "border-border bg-card text-foreground",
        success: "border-status-confirmed-border bg-status-confirmed-bg text-status-confirmed",
        warning: "border-status-pending-border bg-status-pending-bg text-status-pending",
        accent: "border-primary/20 bg-primary-soft text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
