"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function Avatar({ className, ...props }) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  );
}

/**
 * Absolutely covers AvatarFallback. A plain flex sibling loses to Tailwind
 * preflight (`img { max-width: 100% }`) and shares the row with initials.
 */
function AvatarImage({ className, src, alt, onError, ...props }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) return null;

  return (
    <img
      data-slot="avatar-image"
      className={cn(
        "absolute inset-0 z-10 size-full max-w-none object-cover",
        className
      )}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "relative z-0 flex size-full items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
