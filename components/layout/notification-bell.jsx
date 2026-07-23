"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function handleItemClick(notification) {
    if (!notification.is_read) {
      try {
        await markRead(notification.id);
      } catch {
        // Still navigate even if mark-read fails.
      }
    }
    setOpen(false);
    router.push("/appointments");
  }

  async function handleMarkAll() {
    try {
      await markAllRead();
    } catch {
      // Leave panel open; next poll will resync.
    }
  }

  const badgeLabel =
    unreadCount > 9 ? "9+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative text-muted-foreground"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute right-1 top-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-semibold leading-none text-white",
              badgeLabel && badgeLabel.length > 1
                ? "min-h-3.5 min-w-3.5 px-0.5"
                : "h-2 w-2",
            )}
          >
            {badgeLabel && badgeLabel.length > 1 ? badgeLabel : (
              <span className="sr-only">{unreadCount} unread</span>
            )}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </li>
            ) : (
              notifications.map((notification) => {
                const unread = !notification.is_read;
                return (
                  <li key={notification.id} className="border-b border-gray-50 last:border-0">
                    <button
                      type="button"
                      onClick={() => handleItemClick(notification)}
                      className={cn(
                        "w-full px-3 py-2.5 text-left transition-colors hover:bg-gray-50",
                        unread && "bg-primary/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm text-foreground",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {notification.title}
                        </p>
                        <time
                          className="shrink-0 text-[11px] text-muted-foreground"
                          dateTime={notification.created_at}
                        >
                          {formatRelative(notification.created_at)}
                        </time>
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 text-xs leading-snug text-muted-foreground",
                          unread && "text-foreground/80",
                        )}
                      >
                        {notification.message}
                      </p>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}
