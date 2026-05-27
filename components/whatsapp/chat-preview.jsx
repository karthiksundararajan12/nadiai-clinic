"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Bot,
  User,
  CheckCheck,
  Send,
  AlertTriangle,
  X,
  UserCircle,
  Calendar,
  CreditCard,
  Phone,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const STATE_LABELS = {
  WELCOME: "New Chat",
  CHOOSE_LANGUAGE: "Choosing Language",
  COLLECT_NAME: "Collecting Name",
  COLLECT_AGE: "Collecting Age",
  COLLECT_GENDER: "Collecting Gender",
  SHOW_SLOTS: "Showing Slots",
  CONFIRM_SLOT: "Confirming Slot",
  AWAITING_PAYMENT: "Awaiting Payment",
  COMPLETED: "Completed",
  RESCHEDULE: "Rescheduling",
  NO_REPLY: "No Reply",
};

function PatientInfoCard({ conversation }) {
  const name = conversation.patient_name || conversation.phone || "Unknown";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-start gap-3 px-4 py-3 bg-muted/30 border-b border-border">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {conversation.patient_gender && (
            <span className="text-[10px] text-muted-foreground">
              {conversation.patient_gender}
              {conversation.patient_age ? `, ${conversation.patient_age}y` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <Phone className="h-3 w-3 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{conversation.phone}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {conversation.appointment && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 font-medium">
              <Calendar className="h-2.5 w-2.5" />
              {conversation.appointment.date} at {conversation.appointment.time}
            </span>
          )}
          {conversation.payment && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              conversation.payment.status === "completed"
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600"
            )}>
              <CreditCard className="h-2.5 w-2.5" />
              ₹{Number(conversation.payment.amount).toLocaleString("en-IN")}{" "}
              {conversation.payment.status === "completed" ? "Paid" : "Pending"}
              {conversation.payment.payment_mode && ` (${conversation.payment.payment_mode})`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isPatient = msg.direction === "inbound";
  return (
    <div className={cn("flex", isPatient ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5",
          isPatient
            ? "bg-green-600 text-white rounded-tr-sm"
            : "bg-card border border-border rounded-tl-sm"
        )}
      >
        <div className="flex items-center gap-1.5 mb-1">
          {isPatient ? (
            <User className="h-3 w-3 opacity-70" />
          ) : (
            <Bot className="h-3 w-3 text-primary" />
          )}
          <span
            className={cn(
              "text-[10px] font-medium",
              isPatient ? "text-green-100" : "text-primary"
            )}
          >
            {isPatient ? "Patient" : "Nadi Bot"}
          </span>
        </div>
        <p
          className={cn(
            "text-sm leading-relaxed whitespace-pre-line",
            isPatient ? "text-white" : "text-foreground"
          )}
        >
          {msg.message}
        </p>
        <div
          className={cn(
            "flex items-center justify-end gap-1 mt-1",
            isPatient ? "text-green-200" : "text-muted-foreground"
          )}
        >
          <span className="text-[10px]">{msg.time}</span>
          {!isPatient && (
            <CheckCheck className="h-3 w-3 text-blue-500" />
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPreview({ conversation, className }) {
  const [messageInput, setMessageInput] = useState("");
  const scrollRef = useRef(null);

  const conversationId = conversation?.id ?? null;
  const messageCount = conversation?.messages?.length ?? 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationId, messageCount]);

  if (!conversation) {
    return (
      <Card className={cn("flex flex-col items-center justify-center", className)}>
        <div className="text-center p-6">
          <UserCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Select a conversation to view the chat
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Messages update in real-time
          </p>
        </div>
      </Card>
    );
  }

  const stateVariant =
    conversation.state === "COMPLETED"
      ? "success"
      : conversation.state === "AWAITING_PAYMENT"
      ? "warning"
      : conversation.state === "NO_REPLY"
      ? "destructive"
      : "secondary";

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-0 pt-3 px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <CardTitle className="text-sm">Chat Thread</CardTitle>
          <Badge variant={stateVariant} className="text-[10px]">
            {STATE_LABELS[conversation.state] || conversation.state}
          </Badge>
        </div>
      </CardHeader>

      <PatientInfoCard conversation={conversation} />

      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea ref={scrollRef} className="h-full">
          <div
            className="space-y-3 p-4"
            style={{
              background:
                "linear-gradient(to bottom, hsl(var(--muted) / 0.3), hsl(var(--background)))",
            }}
          >
            {(!conversation.messages || conversation.messages.length === 0) ? (
              <div className="py-12 text-center">
                <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No messages yet</p>
              </div>
            ) : (
              conversation.messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <div className="shrink-0 border-t border-border">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border">
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground">
            <Send className="h-3 w-3" />
            Send Message
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground">
            <AlertTriangle className="h-3 w-3" />
            Escalate
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground">
            <X className="h-3 w-3" />
            Close
          </Button>
        </div>
        <div className="flex items-center gap-2 p-3">
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 h-9 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && messageInput.trim()) {
                setMessageInput("");
              }
            }}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            disabled={!messageInput.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
