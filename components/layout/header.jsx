"use client";

import { List, Moon, Sun } from "@phosphor-icons/react";
import { HeaderSearch } from "@/components/layout/header-search";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useDashboardMenu } from "@/components/layout/mobile-nav";
import { useTheme } from "@/hooks/use-theme";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function Header({
  title,
  subtitle,
  onMenuClick,
  showClock = true,
  showSearch = true,
  actions = null,
}) {
  const { theme, toggleTheme } = useTheme();
  const menu = useDashboardMenu();
  const menuOpen = menu?.open ?? false;
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const update = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  const dateLine = [
    subtitle,
    showClock && currentTime ? currentTime : null,
  ].filter(Boolean).join(" · ");

  return (
    <header className="sticky top-0 z-30 flex min-h-14 w-full min-w-0 items-center gap-2 border-b border-border bg-card px-3 py-3 sm:gap-3 sm:px-4 lg:min-h-16 lg:px-6">
      <div className="shrink-0 lg:hidden">
        <button
          ref={menu?.menuButtonRef}
          type="button"
          id="dashboard-menu-button"
          onClick={onMenuClick ?? (() => menu?.setOpen((value) => !value))}
          className="toolbar-icon-button cursor-pointer"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="dashboard-nav-drawer"
        >
          <List size={22} weight="bold" aria-hidden />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="break-words font-display text-lg font-extrabold leading-tight text-[color:var(--heading)] sm:text-xl md:text-2xl lg:text-[1.75rem] lg:leading-8">
          {title}
        </h1>
        {dateLine ? (
          <p className="mt-0.5 break-words text-xs font-medium leading-4 text-muted-foreground">
            {dateLine}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-2">
        {actions}
        {showSearch && (
          <HeaderSearch className="hidden w-36 min-w-0 md:block lg:w-80" />
        )}
        <button
          type="button"
          onClick={toggleTheme}
          className="toolbar-icon-button cursor-pointer"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? (
            <Sun size={20} weight="bold" aria-hidden />
          ) : (
            <Moon size={20} weight="bold" aria-hidden />
          )}
        </button>
        <NotificationBell />
      </div>
    </header>
  );
}

/** Wrap custom header actions (e.g. Past sessions) in the shell toolbar style. */
export function HeaderToolbarButton({ className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "toolbar-icon-button inline-flex h-9 cursor-pointer gap-2 px-3 text-sm font-bold text-[color:var(--heading)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
