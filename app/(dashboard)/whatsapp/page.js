"use client";

import { useState, useMemo } from "react";
import { Header } from "@/components/layout/header";
import { ChatPreview } from "@/components/whatsapp/chat-preview";
import { BotConfig } from "@/components/whatsapp/bot-config";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/shared/search-input";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { useWhatsApp } from "@/hooks/use-whatsapp";
import { useUser } from "@/hooks/use-user";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MessageCircle,
  CalendarCheck,
  IndianRupee,
  Zap,
  Bell,
  BellRing,
  Clock,
  Calendar,
  CreditCard,
  AlertCircle,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";

const STATE_CONFIG = {
  WELCOME: { label: "New", color: "bg-slate-500/10 text-slate-600 border-slate-200" },
  CHOOSE_LANGUAGE: { label: "Language", color: "bg-cyan-500/10 text-cyan-600 border-cyan-200" },
  COLLECT_NAME: { label: "Collecting Info", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  COLLECT_AGE: { label: "Collecting Info", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  COLLECT_GENDER: { label: "Collecting Info", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  SHOW_SLOTS: { label: "Slot Selection", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
  CONFIRM_SLOT: { label: "Confirming Slot", color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
  AWAITING_PAYMENT: { label: "Payment Pending", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  COMPLETED: { label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  RESCHEDULE: { label: "Rescheduling", color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  NO_REPLY: { label: "No Reply", color: "bg-red-500/10 text-red-600 border-red-200" },
};

const FILTER_GROUPS = {
  all: null,
  active: ["WELCOME", "CHOOSE_LANGUAGE", "COLLECT_NAME", "COLLECT_AGE", "COLLECT_GENDER", "SHOW_SLOTS", "CONFIRM_SLOT"],
  payment: ["AWAITING_PAYMENT"],
  completed: ["COMPLETED"],
  escalated: ["NO_REPLY"],
};

function ConversationStateBadge({ state }) {
  const config = STATE_CONFIG[state] || STATE_CONFIG.WELCOME;
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border", config.color)}>
      {config.label}
    </span>
  );
}

function NotificationIcon({ type }) {
  if (type === "new_booking" || type === "booking") return <CalendarCheck className="h-4 w-4 text-emerald-500" />;
  if (type === "payment_received" || type === "payment") return <CreditCard className="h-4 w-4 text-blue-500" />;
  if (type === "no_reply_escalation" || type === "escalation") return <AlertCircle className="h-4 w-4 text-red-500" />;
  return <Bell className="h-4 w-4 text-amber-500" />;
}

export default function WhatsAppPage() {
  const { user } = useUser();
  const doctorId = user?.id;
  const {
    conversations,
    notifications,
    slots,
    stats,
    loading,
    unreadCount,
    markNotificationRead,
    toggleSlot,
    addSlot,
    deleteSlot,
    refresh,
  } = useWhatsApp(doctorId);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [stateFilter, setStateFilter] = useState("all");
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [newSlot, setNewSlot] = useState({ day: 1, start: "09:00", end: "13:00" });

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchesSearch =
        !search ||
        (c.patient_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (c.phone || "").includes(search);
      const filterStates = FILTER_GROUPS[stateFilter];
      const matchesState = !filterStates || filterStates.includes(c.state);
      return matchesSearch && matchesState;
    });
  }, [conversations, search, stateFilter]);

  const selected = conversations.find((c) => c.id === selectedId) || null;

  if (!selected && filteredConversations.length > 0 && !selectedId) {
    // auto-select first conversation on load
  }

  const handleAddSlot = async () => {
    await addSlot(newSlot.day, newSlot.start, newSlot.end);
    setAddSlotOpen(false);
    setNewSlot({ day: 1, start: "09:00", end: "13:00" });
  };

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (loading) {
    return (
      <>
        <Header
          title="WhatsApp Bot"
          subtitle="Manage appointment bookings and patient communication via WhatsApp"
        />
        <div className="flex-1 flex items-center justify-center p-12">
          <LoadingSpinner size="lg" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="WhatsApp Bot"
        subtitle="Manage appointment bookings and patient communication via WhatsApp"
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Conversations"
            value={stats.totalConversations.toLocaleString()}
            change={`${stats.activeConversations} active`}
            changeType="positive"
            icon={MessageCircle}
          />
          <StatsCard
            title="WhatsApp Bookings"
            value={stats.completedBookings.toString()}
            change={`${stats.todayBookings} today`}
            changeType="positive"
            icon={CalendarCheck}
          />
          <StatsCard
            title="Payments Collected"
            value={`₹${stats.totalPayments.toLocaleString("en-IN")}`}
            change={`${stats.pendingPayments} pending`}
            changeType={stats.pendingPayments > 0 ? "warning" : "positive"}
            icon={IndianRupee}
          />
          <StatsCard
            title="Active Bot Sessions"
            value={stats.activeConversations.toString()}
            icon={Zap}
          />
        </div>

        {/* Main 3-Column Layout */}
        <div className="grid gap-6 lg:grid-cols-7">
          {/* LEFT: Conversations Panel */}
          <div className="lg:col-span-3">
            <Card className="flex flex-col h-[calc(100vh-280px)] min-h-[600px]">
              <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <CardTitle className="text-base">Conversations</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={refresh}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Badge variant="secondary" className="text-[10px]">
                      {filteredConversations.length} chats
                    </Badge>
                  </div>
                </div>
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name or phone..."
                />
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {[
                    { key: "all", label: "All" },
                    { key: "active", label: "Active" },
                    { key: "payment", label: "Payment" },
                    { key: "completed", label: "Done" },
                    { key: "escalated", label: "Escalated" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setStateFilter(f.key)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors border",
                        stateFilter === f.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="flex-1 p-0 overflow-hidden">
                <ScrollArea className="h-full">
                  {filteredConversations.length === 0 ? (
                    <div className="py-16">
                      <EmptyState
                        icon={MessageCircle}
                        title="No conversations yet"
                        description="When patients message on WhatsApp, conversations will appear here in real-time."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredConversations.map((conv) => {
                        const initials = (conv.patient_name || conv.phone || "?")
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2);

                        return (
                          <button
                            key={conv.id}
                            onClick={() => setSelectedId(conv.id)}
                            className={cn(
                              "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50",
                              selectedId === conv.id && "bg-primary/5 border-l-2 border-l-primary"
                            )}
                          >
                            <div className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                              conv.state === "COMPLETED"
                                ? "bg-emerald-500/10 text-emerald-600"
                                : conv.state === "AWAITING_PAYMENT"
                                ? "bg-amber-500/10 text-amber-600"
                                : conv.state === "NO_REPLY"
                                ? "bg-red-500/10 text-red-600"
                                : conv.state === "WELCOME"
                                ? "bg-slate-500/10 text-slate-600"
                                : "bg-blue-500/10 text-blue-600"
                            )}>
                              {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">
                                  {conv.patient_name || conv.phone}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {conv.last_message_at}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {conv.phone}
                              </p>
                              <div className="flex items-center justify-between gap-2 mt-1.5">
                                <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                                  {conv.last_message}
                                </p>
                                <ConversationStateBadge state={conv.state} />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* CENTER: Selected Conversation Detail */}
          <div className="lg:col-span-2">
            <ChatPreview
              conversation={selected}
              className="h-[calc(100vh-280px)] min-h-[600px]"
            />
          </div>

          {/* RIGHT: Panels */}
          <div className="lg:col-span-2 space-y-6">
            {/* Notifications */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Notifications</CardTitle>
                </div>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {unreadCount} new
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[220px]">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No notifications yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {notifications.map((notif) => (
                        <button
                          key={notif.id}
                          onClick={() => !notif.read && markNotificationRead(notif.id)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                            !notif.read && "bg-primary/5"
                          )}
                        >
                          <div className="mt-0.5">
                            <NotificationIcon type={notif.type} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={cn("text-xs font-medium", !notif.read && "text-foreground")}>
                                {notif.title}
                              </span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {notif.created_at_display}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {notif.message}
                            </p>
                          </div>
                          {!notif.read && (
                            <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Slot Management */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Slot Management</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setAddSlotOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  Add Slot
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[240px]">
                  {slots.length === 0 ? (
                    <div className="py-8 text-center">
                      <Calendar className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">No slots configured</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Add slots for WhatsApp booking</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-2 w-2 rounded-full",
                              slot.is_available ? "bg-emerald-500" : "bg-slate-300"
                            )} />
                            <div>
                              <p className="text-xs font-medium">{slot.dayName}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {slot.start_time} – {slot.end_time}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={slot.is_available}
                              onCheckedChange={(v) => toggleSlot(slot.id, v)}
                              className="scale-75"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteSlot(slot.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Quick Stats</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                      <CalendarCheck className="h-4 w-4 text-emerald-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Today&apos;s Bookings</span>
                  </div>
                  <span className="text-sm font-semibold">{stats.todayBookings}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                      <Clock className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Pending Payments</span>
                  </div>
                  <span className="text-sm font-semibold">{stats.pendingPayments}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                      <IndianRupee className="h-4 w-4 text-purple-500" />
                    </div>
                    <span className="text-sm text-muted-foreground">Total Revenue</span>
                  </div>
                  <span className="text-sm font-semibold">₹{stats.totalPayments.toLocaleString("en-IN")}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Add Slot Dialog */}
      <Dialog open={addSlotOpen} onOpenChange={setAddSlotOpen}>
        <DialogContent onClose={() => setAddSlotOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add Appointment Slot</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <select
                value={newSlot.day}
                onChange={(e) => setNewSlot((p) => ({ ...p, day: Number(e.target.value) }))}
                className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={newSlot.start}
                  onChange={(e) => setNewSlot((p) => ({ ...p, start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={newSlot.end}
                  onChange={(e) => setNewSlot((p) => ({ ...p, end: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSlotOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSlot}>Add Slot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
