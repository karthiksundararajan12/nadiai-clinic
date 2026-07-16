import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { image: "h-8 w-8", text: "text-sm" },
  md: { image: "h-9 w-9", text: "text-[15px]" },
  lg: { image: "h-10 w-10", text: "text-base" },
  xl: { image: "h-12 w-12", text: "text-lg" },
};

export function BrandLogo({
  size = "md",
  showText = true,
  layout = "horizontal",
  className,
  textClassName,
  priority = false,
}) {
  const styles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
  const isStacked = layout === "stacked";
  const isIconOnly = !showText;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        isStacked
          ? "flex-col"
          : isIconOnly
            ? "justify-center"
            : "w-full flex-row justify-start",
        className
      )}
    >
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
            "font-display font-semibold text-foreground",
            styles.text,
            textClassName
          )}
        >
          Nadi AI
        </span>
      )}
    </div>
  );
}
