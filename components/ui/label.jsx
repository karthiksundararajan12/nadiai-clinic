import { cn } from "@/lib/utils";

function Label({ className, ...props }) {
  return (
    <label
      data-slot="label"
      className={cn(
        "font-display text-sm font-semibold leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className
      )}
      {...props}
    />
  );
}

export { Label };
