"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 30_000;

/**
 * Polls /api/notifications every 30s for the header bell.
 * Supabase realtime on `notifications` is a follow-up.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
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
    setUnreadCount((c) => Math.max(0, c - 1));
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

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh: () => refresh(),
    markRead,
    markAllRead,
  };
}
