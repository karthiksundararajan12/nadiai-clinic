"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useWhatsApp(doctorId) {
  const [conversations, setConversations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [slots, setSlots] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(getSupabaseBrowserClient());

  const fetchConversations = useCallback(async () => {
    if (!doctorId) return;
    const supabase = supabaseRef.current;

    const { data: convos } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (!convos || convos.length === 0) {
      setConversations([]);
      return;
    }

    const convoIds = convos.map((c) => c.id);
    const { data: messages } = await supabase
      .from("wa_messages")
      .select("*")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: true });

    const msgsByConvo = {};
    (messages || []).forEach((m) => {
      if (!msgsByConvo[m.conversation_id]) msgsByConvo[m.conversation_id] = [];
      msgsByConvo[m.conversation_id].push(m);
    });

    const appointmentIds = convos
      .map((c) => c.appointment_id)
      .filter(Boolean);
    let appointmentsMap = {};
    if (appointmentIds.length > 0) {
      const { data: apts } = await supabase
        .from("appointments")
        .select("*")
        .in("id", appointmentIds);
      (apts || []).forEach((a) => {
        appointmentsMap[a.id] = a;
      });
    }

    const paymentIds = convos.map((c) => c.payment_id).filter(Boolean);
    let paymentsMap = {};
    if (paymentIds.length > 0) {
      const { data: pays } = await supabase
        .from("payments")
        .select("*")
        .in("id", paymentIds);
      (pays || []).forEach((p) => {
        paymentsMap[p.id] = p;
      });
    }

    const enriched = convos.map((c) => {
      const msgs = msgsByConvo[c.id] || [];
      const lastMsg = msgs[msgs.length - 1];
      return {
        ...c,
        messages: msgs.map((m) => ({
          direction: m.direction,
          message: m.message,
          time: new Date(m.created_at).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          created_at: m.created_at,
        })),
        last_message: lastMsg?.message || "",
        last_message_at: lastMsg
          ? formatRelativeTime(lastMsg.created_at)
          : formatRelativeTime(c.updated_at),
        appointment: c.appointment_id
          ? appointmentsMap[c.appointment_id] || null
          : null,
        payment: c.payment_id ? paymentsMap[c.payment_id] || null : null,
      };
    });

    setConversations(enriched);
  }, [doctorId]);

  const fetchNotifications = useCallback(async () => {
    if (!doctorId) return;
    const supabase = supabaseRef.current;

    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(30);

    setNotifications(
      (data || []).map((n) => ({
        ...n,
        created_at_display: formatRelativeTime(n.created_at),
      }))
    );
  }, [doctorId]);

  const fetchSlots = useCallback(async () => {
    if (!doctorId) return;
    const supabase = supabaseRef.current;

    const { data } = await supabase
      .from("appointment_slots")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    setSlots(
      (data || []).map((s) => ({
        ...s,
        dayName: DAY_NAMES[s.day_of_week],
      }))
    );
  }, [doctorId]);

  const fetchPayments = useCallback(async () => {
    if (!doctorId) return;
    const supabase = supabaseRef.current;

    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("created_at", { ascending: false })
      .limit(50);

    setPayments(data || []);
  }, [doctorId]);

  const markNotificationRead = useCallback(async (notificationId) => {
    const supabase = supabaseRef.current;
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const toggleSlot = useCallback(
    async (slotId, isAvailable) => {
      const supabase = supabaseRef.current;
      await supabase
        .from("appointment_slots")
        .update({ is_available: isAvailable })
        .eq("id", slotId);

      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId ? { ...s, is_available: isAvailable } : s
        )
      );
    },
    []
  );

  const addSlot = useCallback(
    async (dayOfWeek, startTime, endTime) => {
      if (!doctorId) return;
      const supabase = supabaseRef.current;

      const { data } = await supabase
        .from("appointment_slots")
        .insert({
          doctor_id: doctorId,
          day_of_week: dayOfWeek,
          start_time: startTime,
          end_time: endTime,
          is_available: true,
        })
        .select()
        .single();

      if (data) {
        setSlots((prev) =>
          [...prev, { ...data, dayName: DAY_NAMES[data.day_of_week] }].sort(
            (a, b) =>
              a.day_of_week - b.day_of_week ||
              a.start_time.localeCompare(b.start_time)
          )
        );
      }
    },
    [doctorId]
  );

  const deleteSlot = useCallback(async (slotId) => {
    const supabase = supabaseRef.current;
    await supabase.from("appointment_slots").delete().eq("id", slotId);
    setSlots((prev) => prev.filter((s) => s.id !== slotId));
  }, []);

  useEffect(() => {
    if (!doctorId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    Promise.all([
      fetchConversations(),
      fetchNotifications(),
      fetchSlots(),
      fetchPayments(),
    ]).finally(() => setLoading(false));
  }, [doctorId, fetchConversations, fetchNotifications, fetchSlots, fetchPayments]);

  useEffect(() => {
    if (!doctorId) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel("whatsapp-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversations",
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "wa_messages",
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => fetchNotifications()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `doctor_id=eq.${doctorId}`,
        },
        () => fetchPayments()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId, fetchConversations, fetchNotifications, fetchPayments]);

  const totalPayments = payments
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayBookings = conversations.filter(
    (c) => c.appointment?.date === todayStr && c.state === "COMPLETED"
  ).length;

  const pendingPaymentCount = conversations.filter(
    (c) => c.state === "AWAITING_PAYMENT"
  ).length;

  return {
    conversations,
    notifications,
    slots,
    payments,
    loading,
    stats: {
      totalConversations: conversations.length,
      activeConversations: conversations.filter(
        (c) => !["COMPLETED", "NO_REPLY"].includes(c.state)
      ).length,
      completedBookings: conversations.filter((c) => c.state === "COMPLETED")
        .length,
      pendingPayments: pendingPaymentCount,
      totalPayments,
      todayBookings,
    },
    unreadCount: notifications.filter((n) => !n.read).length,
    markNotificationRead,
    toggleSlot,
    addSlot,
    deleteSlot,
    refresh: () =>
      Promise.all([
        fetchConversations(),
        fetchNotifications(),
        fetchSlots(),
        fetchPayments(),
      ]),
  };
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}
