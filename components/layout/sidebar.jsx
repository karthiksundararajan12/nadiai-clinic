"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  Users,
  MessageCircle,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";

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
  const { displayName, initials, specialization } = useUser();

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white text-gray-900 shadow-sm transition-all duration-300 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center border-b border-gray-200 dark:border-gray-800",
          collapsed ? "h-16 px-2" : "h-20 px-3"
        )}
      >
        {collapsed ? (
          <Image
            src="/logo.png"
            alt="Nadi AI"
            width={48}
            height={48}
            className="shrink-0 object-contain"
          />
        ) : (
          <Image
            src="/logo.png"
            alt="Nadi AI"
            width={220}
            height={60}
            className="h-14 w-auto object-contain"
          />
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
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
                  collapsed && "justify-center px-0"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive
                        ? "text-primary"
                        : "text-gray-400 group-hover:text-gray-900 dark:text-gray-500 dark:group-hover:text-gray-100"
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

      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        <Separator className="mb-3 bg-gray-200 dark:bg-gray-800" />
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex flex-1 flex-col min-w-0">
              <span className="text-sm font-medium text-gray-900 truncate dark:text-gray-100">
                {displayName}
              </span>
              {specialization && (
                <span className="text-[11px] text-gray-500 truncate dark:text-gray-400">
                  {specialization}
                </span>
              )}
            </div>
          )}
          {!collapsed && (
            <Tooltip content="Sign out" side="top">
              <button
                onClick={handleSignOut}
                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-gray-500 dark:hover:bg-red-950 dark:hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-100"
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
