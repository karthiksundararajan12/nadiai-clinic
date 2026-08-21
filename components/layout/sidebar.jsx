"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import {
  LayoutDashboard,
  Mic,
  CalendarDays,
  CreditCard,
  Users,
  Syringe,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { filterNavItems } from "@/lib/specialization-nav";
import { ICON_SIZE_NAV, ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useDoctorProfileSettings } from "@/hooks/use-doctor-profile-settings";
import {
  confirmRecordingLeave,
  shouldBlockNavigation,
} from "@/features/scribe/recording/recording-guard.js";

const ICON_MAP = {
  LayoutDashboard,
  Mic,
  CalendarDays,
  CreditCard,
  Users,
  Syringe,
  Settings,
};

export function Sidebar({ collapsed, onToggle }) {
  const pathname = usePathname();
  const router = useRouter();
  const { displayName, initials, specialization, profile } = useUser();
  const { personalProfile } = useDoctorProfileSettings();
  const avatarUrl =
    personalProfile?.avatarUrl ?? profile?.avatar_url ?? null;
  const visibleNavItems = filterNavItems(NAV_ITEMS, specialization);

  const navigateIfAllowed = (href, event) => {
    if (!shouldBlockNavigation(pathname, href)) return true;
    event?.preventDefault();
    if (confirmRecordingLeave()) {
      router.push(href);
      return true;
    }
    return false;
  };

  const handleSignOut = async () => {
    if (shouldBlockNavigation(pathname, "/login") && !confirmRecordingLeave()) {
      return;
    }
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background text-foreground shadow-sm transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      <div
        className={cn(
          "flex items-center border-b border-border px-4 py-4",
          collapsed && "justify-center px-3"
        )}
      >
        <BrandLogo
          size={collapsed ? "sm" : "md"}
          showText={!collapsed}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <ul className="flex flex-col gap-1">
          {visibleNavItems.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            const linkContent = (
              <Link
                href={item.href}
                onClick={(event) => {
                  navigateIfAllowed(item.href, event);
                }}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-body font-medium transition-colors",
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                  collapsed && "justify-center px-0"
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      ICON_SIZE_NAV,
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-primary"
                    )}
                    strokeWidth={ICON_STROKE}
                  />
                )}
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant="accent"
                        className="h-5 px-2 text-caption font-semibold"
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

      <div className="border-t border-border p-3">
        <Separator className="mb-3 bg-border" />
        <div
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2",
            collapsed && "justify-center px-0"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-caption font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col min-w-0">
              <span className="truncate text-body font-medium [color:var(--heading)]">
                {displayName}
              </span>
              {specialization && (
                <span className="text-caption font-medium text-muted-foreground truncate">
                  {specialization}
                </span>
              )}
            </div>
          )}
          {!collapsed && (
            <Tooltip content="Sign out" side="top">
              <button
                onClick={handleSignOut}
                className="rounded-lg p-2 text-muted-foreground hover:bg-status-cancelled-bg hover:text-status-cancelled transition-colors"
              >
                <LogOut className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <button
        onClick={onToggle}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-primary-soft hover:text-primary"
      >
        {collapsed ? (
          <ChevronRight className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
        ) : (
          <ChevronLeft className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
        )}
      </button>
    </aside>
  );
}
