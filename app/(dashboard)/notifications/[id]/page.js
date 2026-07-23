"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, CalendarDays, IndianRupee } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotificationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/notifications/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load notification");
        }
        setNotification(payload.notification ?? null);
        setError(null);

        if (payload.notification && !payload.notification.is_read) {
          const markRes = await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: payload.notification.id }),
          });
          if (markRes.ok) {
            setNotification((prev) => (prev ? { ...prev, is_read: true } : prev));
          }
        }
      } catch (loadError) {
        if (loadError.name !== "AbortError") {
          setError(loadError);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [id]);

  const isPayment = notification?.type === "payment_received";

  return (
    <>
      <Header
        title="Notification"
        subtitle={notification?.title ?? "Details"}
      />
      <div className="flex-1 p-6">
        <div className="mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push("/notifications")}
          >
            <ArrowLeft className="h-4 w-4" />
            All notifications
          </Button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading notification…
          </p>
        ) : error ? (
          <div className="mx-auto max-w-xl rounded-xl border border-border bg-white px-6 py-12 text-center">
            <p className="text-sm text-destructive">
              {error.message || "Notification not found"}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/notifications")}
            >
              Back to notifications
            </Button>
          </div>
        ) : !notification ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Notification not found
          </p>
        ) : (
          <article
            className={cn(
              "mx-auto max-w-xl rounded-xl border border-border bg-white p-6 shadow-sm",
              isPayment && "border-primary/20",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {isPayment ? "Payment" : notification.type}
                </p>
                <h1 className="mt-1 font-display text-xl font-semibold text-foreground">
                  {notification.title}
                </h1>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  notification.is_read
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                {notification.is_read ? "Read" : "Unread"}
              </span>
            </div>

            <time
              className="mt-2 block text-xs text-muted-foreground"
              dateTime={notification.created_at}
            >
              {formatAbsolute(notification.created_at)}
              {" · "}
              {formatRelative(notification.created_at)}
            </time>

            <div
              className={cn(
                "mt-6 rounded-lg border border-border/80 bg-muted/30 px-4 py-4",
                isPayment && "border-primary/15 bg-primary/5",
              )}
            >
              {isPayment ? (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <IndianRupee className="h-4 w-4" />
                  </div>
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                    {notification.message}
                  </p>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                  {notification.message}
                </p>
              )}
            </div>

            {notification.related_appointment_id ? (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-5">
                <Link
                  href={`/appointments?appointmentId=${notification.related_appointment_id}`}
                  className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
                >
                  <CalendarDays className="h-4 w-4" />
                  View related appointment
                </Link>
                <Link
                  href="/notifications"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  Back to list
                </Link>
              </div>
            ) : (
              <div className="mt-6 border-t border-border pt-5">
                <Link
                  href="/notifications"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  Back to list
                </Link>
              </div>
            )}
          </article>
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
    return format(new Date(iso), "EEEE, dd MMM yyyy · h:mm a");
  } catch {
    return iso ?? "";
  }
}
