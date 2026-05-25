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

function AvatarImage({ className, src, alt, ...props }) {
  if (!src) return null;
  return (
    <img
      data-slot="avatar-image"
      className={cn("aspect-square h-full w-full object-cover", className)}
      src={src}
      alt={alt}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback };
