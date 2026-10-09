"use client";

import { List, Moon, Sun } from "@phosphor-icons/react";
import { SearchInput } from "@/components/shared/search-input";
import { Tooltip } from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/layout/notification-bell";
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="toolbar-icon-button cursor-pointer lg:hidden"
          aria-label="Open menu"
        >
          <List size={22} weight="bold" aria-hidden />
        </button>
        <div>
          <h1 className="type-title">{title}</h1>
          {subtitle && (
            <p className="text-sm font-medium text-muted-foreground">
              {subtitle}
              {showClock && currentTime && (
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  {currentTime}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {actions}
        {showSearch && (
          <div className="hidden md:block">
            <Tooltip content="Coming soon" side="bottom">
              <SearchInput
                value=""
                placeholder="Search patients, appointments..."
                className="w-64"
                disabled
                title="Coming soon"
              />
            </Tooltip>
          </div>
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
