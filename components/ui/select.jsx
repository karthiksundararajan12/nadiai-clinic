"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

function Select({ value, onValueChange, children, ...props }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={cn("relative", open && "z-50")} {...props}>
      {typeof children === "function"
        ? children({ open, setOpen, value, onValueChange })
        : children}
    </div>
  );
}

function SelectTrigger({ className, children, open, onClick, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 opacity-50 transition-transform",
          open && "rotate-180"
        )}
      />
    </button>
  );
}

function SelectContent({ className, children, open, ...props }) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "absolute z-[100] mt-1 w-full rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function SelectItem({ className, value, selected, onSelect, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 px-2 text-sm outline-none hover:bg-accent/10 focus:bg-accent/10",
        selected && "bg-primary/5 text-primary",
        className
      )}
      onClick={() => onSelect?.(value)}
      {...props}
    >
      <span className="flex-1 text-left">{children}</span>
      {selected && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}

export { Select, SelectTrigger, SelectContent, SelectItem };
