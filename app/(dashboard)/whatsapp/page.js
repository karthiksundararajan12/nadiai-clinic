"use client";

import { Header } from "@/components/layout/header";
import { ChatPreview } from "@/components/whatsapp/chat-preview";
import { BotConfig } from "@/components/whatsapp/bot-config";
import { MessageTemplates } from "@/components/whatsapp/message-templates";
import { StatsCard } from "@/components/dashboard/stats-card";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  Users,
  CalendarCheck,
  TrendingUp,
  Phone,
  Clock,
} from "lucide-react";

const RECENT_BOOKINGS = [
  { patient: "Rohit Verma", date: "26 May", time: "10:00 AM", status: "confirmed" },
  { patient: "Neha Gupta", date: "26 May", time: "2:00 PM", status: "pending" },
  { patient: "Sanjay Rao", date: "27 May", time: "9:00 AM", status: "confirmed" },
  { patient: "Kavita Nair", date: "27 May", time: "11:00 AM", status: "pending" },
];

export default function WhatsAppPage() {
  return (
    <>
      <Header
        title="WhatsApp Bot"
        subtitle="Manage appointment bookings and patient communication via WhatsApp"
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Conversations"
            value="1,892"
            change="18%"
            changeType="positive"
            icon={MessageCircle}
          />
          <StatsCard
            title="Bookings via WhatsApp"
            value="156"
            change="23%"
            changeType="positive"
            icon={CalendarCheck}
          />
          <StatsCard
            title="Active Users"
            value="342"
            change="12"
            changeType="positive"
            icon={Users}
          />
          <StatsCard
            title="Response Rate"
            value="98.5%"
            change="1.2%"
            changeType="positive"
            icon={TrendingUp}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ChatPreview />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <BotConfig />

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent Bookings</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Via WhatsApp
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {RECENT_BOOKINGS.map((booking, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-6 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                          <Phone className="h-3.5 w-3.5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {booking.patient}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {booking.date} at {booking.time}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          booking.status === "confirmed"
                            ? "success"
                            : "warning"
                        }
                        className="text-[10px]"
                      >
                        {booking.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <MessageTemplates />
          </div>
        </div>
      </div>
    </>
  );
}
