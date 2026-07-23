"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { ICON_SIZE_NAV, ICON_STROKE } from "@/lib/icons";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

/**
 * Dashboard header notification bell.
 *
 * Uses a native <button> (not the shared Base UI Button) so toggle clicks are
 * never swallowed by composite/menu trigger quirks. The panel is portaled to
 * document.body so sticky header / sibling overflow cannot clip it. Outside
 * dismiss is attached on the next tick so the opening click cannot close it.
 */
export function NotificationBell() {
  const router = useRouter();
  const { notifications, unreadCount, markRead, markAllRead, refresh } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelStyle(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const width = Math.min(352, window.innerWidth - 16);
    const right = Math.max(8, window.innerWidth - rect.right);
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 8,
      right,
      width,
      zIndex: 100,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      const panel = document.getElementById("notification-bell-panel");
      if (panel?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    // Defer so the same gesture that opened the panel cannot immediately close it.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next) {
        // Fresh fetch when opening — don't rely only on the 30s poll.
        void refresh();
      }
      return next;
    });
  }

  async function handleItemClick(notification) {
    if (!notification.is_read) {
      try {
        await markRead(notification.id);
      } catch {
        // Still navigate even if mark-read fails.
      }
    }
    setOpen(false);
    router.push(`/notifications/${notification.id}`);
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

  const panel =
    open && mounted && panelStyle ? (
      <div
        id="notification-bell-panel"
        role="dialog"
        aria-label="Notifications"
        style={panelStyle}
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
            >
              View all
            </button>
          </div>
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
                <li
                  key={notification.id}
                  className="border-b border-gray-50 last:border-0"
                >
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
                    {notification.message ? (
                      <p
                        className={cn(
                          "mt-0.5 text-xs leading-snug text-muted-foreground",
                          unread && "text-foreground/80",
                        )}
                      >
                        {notification.message}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground",
          "transition-colors hover:bg-gray-50 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-gray-50 text-foreground",
        )}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggleOpen}
      >
        <Bell className={ICON_SIZE_NAV} strokeWidth={ICON_STROKE} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute right-1 top-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-semibold leading-none text-white",
              badgeLabel && badgeLabel.length > 1
                ? "min-h-3.5 min-w-3.5 px-0.5"
                : "h-2 w-2",
            )}
          >
            {badgeLabel && badgeLabel.length > 1 ? (
              badgeLabel
            ) : (
              <span className="sr-only">{unreadCount} unread</span>
            )}
          </span>
        )}
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
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
