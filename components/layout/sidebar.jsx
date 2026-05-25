"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
  LogOut,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, APP_NAME } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

const ICON_MAP = {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
};

export function Sidebar({ collapsed, onToggle }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed ? "justify-center" : "gap-3"
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
          <Activity className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight">{APP_NAME}</span>
            <span className="text-[11px] text-sidebar-muted">Clinical Assistant</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive
                        ? "text-sidebar-primary"
                        : "text-sidebar-muted group-hover:text-sidebar-accent-foreground"
                    )}
                  />
                )}
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="accent"
                        className="h-5 px-1.5 text-[10px] font-semibold"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </Link>
            );

            return (
              <li key={item.href}>
                {collapsed ? (
                  <Tooltip content={item.title} side="right">
                    {linkContent}
                  </Tooltip>
                ) : (
                  linkContent
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Separator className="mb-3 bg-sidebar-border" />
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary">
            AM
          </div>
          {!collapsed && (
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">Dr. Ananya Mehta</span>
              <span className="text-[11px] text-sidebar-muted">
                Cardiologist
              </span>
            </div>
          )}
          {!collapsed && (
            <button className="rounded-md p-1 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar-background text-sidebar-muted shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
