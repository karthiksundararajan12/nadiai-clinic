"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { CaretLeft, CaretRight, SignOut } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { filterNavItems } from "@/lib/specialization-nav";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/use-user";
import { useDoctorProfileSettings } from "@/hooks/use-doctor-profile-settings";
import {
  confirmRecordingLeave,
  shouldBlockNavigation,
} from "@/features/scribe/recording/recording-guard.js";
import { DashboardNavIcon } from "@/components/layout/dashboard-nav-icons.jsx";

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
        "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
      style={{ boxShadow: "var(--sidebar-shadow)" }}
    >
      <div
        className={cn(
          "flex items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-3 py-4" : "px-4 py-4",
        )}
      >
        {collapsed ? (
          <BrandLogo size="sm" showText={false} />
        ) : (
          <Link
            href="/dashboard"
            onClick={(event) => navigateIfAllowed("/dashboard", event)}
            className="inline-block"
          >
            <Image
              src="/nadiai-logo.png"
              alt="Nadi AI"
              width={200}
              height={48}
              priority
              className="h-10 w-auto object-contain object-left"
            />
          </Link>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        <ul className="flex flex-col gap-1">
          {visibleNavItems.map((item) => {
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
                  "group flex h-11 items-center gap-3 rounded-xl px-3 text-nav font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
                  collapsed && "justify-center px-0",
                )}
              >
                <DashboardNavIcon
                  iconKey={item.icon}
                  active={isActive}
                  className={cn(
                    isActive ? "text-primary-foreground" : "text-icon-muted group-hover:text-primary",
                  )}
                />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.title}</span>
                    {item.badge && (
                      <Badge
                        variant={item.badge === "AI" ? "ai" : "accent"}
                        className="h-6 px-2.5 text-caption font-bold"
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
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl px-2 py-2",
            collapsed && "justify-center px-0",
          )}
        >
          <Avatar className="h-10 w-10 border border-border">
            <AvatarImage src={avatarUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="bg-primary-muted text-sm font-bold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-display text-sm font-bold text-[color:var(--heading)]">
                {displayName}
              </span>
              {specialization && (
                <span className="truncate text-sm font-medium text-muted-foreground">
                  {specialization}
                </span>
              )}
            </div>
          )}
          {!collapsed && (
            <Tooltip content="Sign out" side="top">
              <button
                type="button"
                onClick={handleSignOut}
                className="toolbar-icon-button cursor-pointer hover:!bg-primary-soft hover:!text-primary"
                aria-label="Sign out"
              >
                <SignOut size={20} weight="bold" aria-hidden />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="absolute -right-3 top-[4.25rem] flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-icon-muted shadow-clinical transition-colors hover:bg-primary-soft hover:text-primary"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <CaretRight size={14} weight="bold" aria-hidden />
        ) : (
          <CaretLeft size={14} weight="bold" aria-hidden />
        )}
      </button>
    </aside>
  );
}
