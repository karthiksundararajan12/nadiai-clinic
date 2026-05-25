import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const ScrollArea = forwardRef(function ScrollArea({ className, children, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="scroll-area"
      className={cn("relative overflow-auto scrollbar-thin", className)}
      {...props}
    >
      {children}
    </div>
  );
});

export { ScrollArea };
