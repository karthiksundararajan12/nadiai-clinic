"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { Bell, CalendarDays, ChevronRight } from "lucide-react";
import { Header } from "@/components/layout/header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <>
          <Header title="Notifications" subtitle="Payment and clinic alerts" />
          <p className="p-6 text-sm text-muted-foreground">Loading notifications…</p>
        </>
      }
    >
      <NotificationsPageContent />
    </Suspense>
  );
}

function NotificationsPageContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const highlightRef = useRef(null);

  const load = useCallback(async ({ offset = 0, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load notifications");
      }
      const rows = Array.isArray(payload.notifications) ? payload.notifications : [];
      setNotifications((prev) => (append ? [...prev, ...rows] : rows));
      setUnreadCount(Number(payload.unreadCount) || 0);
      setHasMore(Boolean(payload.hasMore));
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load({ offset: 0, append: false });
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading || notifications.length === 0) return;
    const el =
      highlightRef.current ?? document.getElementById(`notification-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, loading, notifications]);

  async function markAllRead() {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    if (!response.ok) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }

  return (
    <>
      <Header
        title="Notifications"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread`
            : "Payment and clinic alerts"
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Full history of in-app alerts for your clinic.
          </p>
          {unreadCount > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={markAllRead}>
              Mark all read
            </Button>
          )}
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading notifications…
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-destructive">
            {error.message || "Failed to load notifications"}
          </p>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Payment received alerts will appear here after patients pay."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white">
            {notifications.map((notification) => {
              const highlighted = highlightId === notification.id;
              const unread = !notification.is_read;
              return (
                <li
                  key={notification.id}
                  id={`notification-${notification.id}`}
                  ref={highlighted ? highlightRef : null}
                >
                  <Link
                    href={`/notifications/${notification.id}`}
                    className={cn(
                      "flex items-start gap-3 px-4 py-4 transition-colors hover:bg-muted/50",
                      unread && "bg-primary/5",
                      highlighted && "ring-2 ring-inset ring-primary",
                    )}
                  >
                    <div
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary",
                        unread ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
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
                          title={formatAbsolute(notification.created_at)}
                        >
                          {formatRelative(notification.created_at)}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                        {notification.message}
                      </p>
                      {notification.related_appointment_id ? (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" />
                          Related appointment on file
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={() => load({ offset: notifications.length, append: true })}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function formatRelative(iso) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatAbsolute(iso) {
  try {
    return format(new Date(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso ?? "";
  }
}
