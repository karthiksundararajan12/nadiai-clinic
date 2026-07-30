"use client";

import { Menu, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { Tooltip } from "@/components/ui/tooltip";
import { NotificationBell } from "@/components/layout/notification-bell";
import { useTheme } from "@/hooks/use-theme";
import { useState, useEffect } from "react";
import { ICON_SIZE_NAV, ICON_STROKE } from "@/lib/icons";

export function Header({ title, subtitle, onMenuClick }) {
  const { theme, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const update = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-gray-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <Menu className={ICON_SIZE_NAV} strokeWidth={ICON_STROKE} />
        </button>
        <div>
          <h1 className="font-display text-lg font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm font-medium text-muted-foreground">
              {subtitle}
              {currentTime && (
                <span className="ml-2 text-xs font-medium text-muted-foreground/70">
                  {currentTime}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
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
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-muted-foreground"
        >
          {theme === "dark" ? (
            <Sun className={ICON_SIZE_NAV} strokeWidth={ICON_STROKE} />
          ) : (
            <Moon className={ICON_SIZE_NAV} strokeWidth={ICON_STROKE} />
          )}
        </Button>
        <NotificationBell />
      </div>
    </header>
  );
}
