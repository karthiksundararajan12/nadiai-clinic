import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: { icon: "h-8 w-8", text: "text-sm" },
  md: { icon: "h-9 w-9", text: "text-[15px]" },
  lg: { icon: "h-10 w-10", text: "text-base" },
  xl: { icon: "h-12 w-12", text: "text-lg" },
};

function BrandLogoIcon({ className }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle cx="20" cy="20" r="20" fill="var(--clinical)" />
      <circle
        cx="20"
        cy="20"
        r="11"
        stroke="var(--clinical-foreground)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="52 18"
        strokeDashoffset="8"
        opacity="0.9"
      />
      <path
        d="M11.5 20h3.2l1.6-4.8 2.4 9.6 2-5.2h3.3"
        stroke="var(--clinical-foreground)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="27.5" cy="20" r="1.5" fill="var(--clinical-foreground)" />
    </svg>
  );
}

export function BrandLogo({
  size = "md",
  showText = true,
  layout = "horizontal",
  className,
  textClassName,
  iconClassName,
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
      <BrandLogoIcon className={cn(styles.icon, iconClassName)} />
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
