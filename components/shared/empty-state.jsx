import { cn } from "@/lib/utils";
import { ICON_SIZE_XL, ICON_STROKE } from "@/lib/icons";

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full border border-border bg-card p-4 text-muted-foreground shadow-clinical">
          <Icon className={ICON_SIZE_XL} strokeWidth={ICON_STROKE} />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
