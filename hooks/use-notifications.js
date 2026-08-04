"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const POLL_MS = 30_000;

const NotificationsContext = createContext(null);

/**
 * Shared notifications state for the dashboard (header bell + pages).
 * Polls /api/notifications every 30s. Supabase realtime is a follow-up.
 *
 * Mark-read mutations update Supabase then immediately adjust unreadCount
 * so the bell badge hides without waiting for the next poll.
 */
export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const refresh = useCallback(async (signal) => {
    try {
      const response = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
        signal: signal instanceof AbortSignal ? signal : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load notifications");
      }
      setNotifications(
        Array.isArray(payload.notifications) ? payload.notifications : [],
      );
      setUnreadCount(Number(payload.unreadCount) || 0);
      setError(null);
    } catch (loadError) {
      if (loadError?.name !== "AbortError") {
        setError(loadError);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    const interval = setInterval(() => {
      refresh();
    }, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [refresh]);

  const markRead = useCallback(async (id) => {
    const existing = notificationsRef.current.find((n) => n.id === id);
    const alreadyReadLocally = existing?.is_read === true;

    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to mark notification read");
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    // Decrement when we didn't already treat it as read locally.
    // Covers detail-page opens (may not be in the recent-20 list) and
    // avoids double-decrement when bell then detail both mark the same item.
    if (!alreadyReadLocally) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    return payload.notification;
  }, []);

  const markAllRead = useCallback(async () => {
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to mark all notifications read");
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    return payload.updated ?? 0;
  }, []);

  const refreshPublic = useCallback(() => refresh(), [refresh]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      refresh: refreshPublic,
      markRead,
      markAllRead,
    }),
    [
      notifications,
      unreadCount,
      loading,
      error,
      refreshPublic,
      markRead,
      markAllRead,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
}
