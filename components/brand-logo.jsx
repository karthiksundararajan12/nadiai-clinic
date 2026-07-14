import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { image: "h-12 w-12", text: "text-sm" },
  md: { image: "h-16 w-16", text: "text-base" },
  lg: { image: "h-20 w-20", text: "text-lg" },
  xl: { image: "h-24 w-24", text: "text-xl" },
};

export function BrandLogo({
  size = "md",
  showText = true,
  className,
  textClassName,
  priority = false,
}) {
  const styles = SIZE_STYLES[size] ?? SIZE_STYLES.md;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <Image
        src="/logo.png"
        alt="Nadi AI"
        width={512}
        height={512}
        priority={priority}
        unoptimized
        className={cn("shrink-0 object-contain", styles.image)}
      />
      {showText && (
        <span
          className={cn(
            "font-bold tracking-tight text-foreground",
            styles.text,
            textClassName,
          )}
        >
          Nadi AI
        </span>
      )}
    </div>
  );
}
