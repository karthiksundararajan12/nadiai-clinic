"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { X } from "lucide-react";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  CreditCard,
  Users,
  Syringe,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { filterNavItems } from "@/lib/specialization-nav";
import { ICON_SIZE_NAV, ICON_STROKE } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/hooks/use-user";

const ICON_MAP = {
  LayoutDashboard,
  Mic,
  CalendarDays,
  CreditCard,
  Users,
  Syringe,
  Settings,
};

export function MobileNav({ open, onClose }) {
  const pathname = usePathname();
  const { specialization } = useUser();
  const visibleNavItems = filterNavItems(NAV_ITEMS, specialization);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50 glass" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-[280px] bg-background text-foreground shadow-sm animate-in slide-in-from-left">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <BrandLogo size="md" />
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-primary-soft hover:text-primary"
          >
            <X className={ICON_SIZE_NAV} strokeWidth={ICON_STROKE} />
          </button>
        </div>

        <nav className="p-3">
          <ul className="flex flex-col gap-1">
            {visibleNavItems.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors",
                      isActive
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-primary-soft hover:text-primary"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          ICON_SIZE_NAV,
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground"
                        )}
                        strokeWidth={ICON_STROKE}
                      />
                    )}
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="accent"
                        className="h-5 px-2 text-caption font-semibold"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
