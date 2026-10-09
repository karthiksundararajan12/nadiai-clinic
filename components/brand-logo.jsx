import Image from "next/image";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { tile: "h-8 w-8 text-sm", text: "text-sm", wordmark: "text-base" },
  md: { tile: "h-9 w-9 text-base", text: "text-sm", wordmark: "text-xl" },
  lg: { tile: "h-10 w-10 text-lg", text: "text-body", wordmark: "text-xl" },
  xl: { tile: "h-12 w-12 text-xl", text: "type-title", wordmark: "text-2xl" },
};

function LogoMark({ size = "md", className }) {
  const styles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent font-display font-extrabold text-primary-foreground shadow-sm",
        styles.tile,
        className,
      )}
      aria-hidden
    >
      N
    </span>
  );
}

export function BrandLogo({
  size = "md",
  showText = true,
  layout = "horizontal",
  className,
  textClassName,
  /** White plate + soft ring so the indigo logo disc stays visible on dark panels. */
  onDark = false,
  priority = false,
  /** Dashboard sidebar: gradient tile + Plus Jakarta wordmark (no PNG). */
  variant = "default",
}) {
  const styles = SIZE_STYLES[size] ?? SIZE_STYLES.md;
  const isStacked = layout === "stacked";
  const isIconOnly = !showText;
  const useShellMark = variant === "shell";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5",
        isStacked
          ? "flex-col"
          : isIconOnly
            ? "justify-center"
            : "w-full flex-row justify-start",
        className,
      )}
    >
      {useShellMark ? (
        <LogoMark size={size} />
      ) : onDark ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full bg-white p-0.5",
            "shadow-[0_0_0_3px_rgba(255,255,255,0.18)] ring-1 ring-white/90",
          )}
        >
          <Image
            src="/logo.png"
            alt={showText ? "" : "Nadi AI"}
            width={512}
            height={512}
            priority={priority}
            unoptimized
            className="h-9 w-9 shrink-0 rounded-full object-contain"
          />
        </span>
      ) : (
        <Image
          src="/logo.png"
          alt="Nadi AI"
          width={512}
          height={512}
          priority={priority}
          unoptimized
          className={cn("shrink-0 object-contain h-9 w-9", size === "sm" && "h-8 w-8", size === "xl" && "h-12 w-12")}
        />
      )}
      {showText && (
        <span
          className={cn(
            "font-display font-extrabold tracking-tight text-[color:var(--heading)]",
            useShellMark ? styles.wordmark : styles.text,
            textClassName,
          )}
        >
          Nadi AI
        </span>
      )}
    </div>
  );
}
