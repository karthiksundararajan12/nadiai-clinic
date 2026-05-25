"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Activity } from "lucide-react";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, APP_NAME } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";

const ICON_MAP = {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
};

export function MobileNav({ open, onClose }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="fixed inset-0 bg-black/50 glass" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 w-[280px] bg-sidebar-background text-sidebar-foreground shadow-xl animate-in slide-in-from-left">
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary">
              <Activity className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight">
              {APP_NAME}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-sidebar-muted hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
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
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px]",
                          isActive
                            ? "text-sidebar-primary"
                            : "text-sidebar-muted"
                        )}
                      />
                    )}
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="accent"
                        className="h-5 px-1.5 text-[10px] font-semibold"
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
