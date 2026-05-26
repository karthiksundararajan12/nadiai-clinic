"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Globe,
  Clock,
  Shield,
  MessageSquare,
  IndianRupee,
  CreditCard,
  BellRing,
  Timer,
} from "lucide-react";
import { useState } from "react";

export function BotConfig() {
  const [config, setConfig] = useState({
    autoReply: true,
    hinglish: true,
    appointmentBooking: true,
    prescriptionSharing: false,
    workingHoursOnly: true,
    startTime: "09:00",
    endTime: "18:00",
    welcomeMessage:
      "Namaste! Welcome to Dr. Ananya Mehta's clinic. Main aapki kaise madad kar sakti hoon?",
    consultationFee: "500",
    paymentGateway: "razorpay",
    autoReminder: true,
    reminderMinutes: "30",
    noReplyTimeout: "10",
  });

  const updateConfig = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Bot Configuration</CardTitle>
          </div>
          <Badge variant="success" className="text-[10px]">
            Connected
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Core Bot Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Auto Reply</p>
                <p className="text-xs text-muted-foreground">
                  Automatically respond to patient messages
                </p>
              </div>
            </div>
            <Switch
              checked={config.autoReply}
              onCheckedChange={(v) => updateConfig("autoReply", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Hinglish Mode</p>
                <p className="text-xs text-muted-foreground">
                  Respond in Hindi-English mix for better understanding
                </p>
              </div>
            </div>
            <Switch
              checked={config.hinglish}
              onCheckedChange={(v) => updateConfig("hinglish", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Appointment Booking</p>
                <p className="text-xs text-muted-foreground">
                  Allow patients to book via WhatsApp
                </p>
              </div>
            </div>
            <Switch
              checked={config.appointmentBooking}
              onCheckedChange={(v) => updateConfig("appointmentBooking", v)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Working Hours Only</p>
                <p className="text-xs text-muted-foreground">
                  Only respond during clinic hours
                </p>
              </div>
            </div>
            <Switch
              checked={config.workingHoursOnly}
              onCheckedChange={(v) => updateConfig("workingHoursOnly", v)}
            />
          </div>

          {config.workingHoursOnly && (
            <div className="ml-7 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Start Time</Label>
                <Input
                  type="time"
                  value={config.startTime}
                  onChange={(e) => updateConfig("startTime", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Time</Label>
                <Input
                  type="time"
                  value={config.endTime}
                  onChange={(e) => updateConfig("endTime", e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Payment Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">Payment Settings</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Consultation Fee (INR)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                value={config.consultationFee}
                onChange={(e) => updateConfig("consultationFee", e.target.value)}
                className="pl-7"
                min="0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Payment Gateway</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateConfig("paymentGateway", "razorpay")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  config.paymentGateway === "razorpay"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                Razorpay
              </button>
              <button
                onClick={() => updateConfig("paymentGateway", "upi")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  config.paymentGateway === "upi"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <IndianRupee className="h-3.5 w-3.5" />
                UPI Direct
              </button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Reminder & Timeout Settings */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BellRing className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Auto-Reminder</p>
                <p className="text-xs text-muted-foreground">
                  Send reminder before appointment
                </p>
              </div>
            </div>
            <Switch
              checked={config.autoReminder}
              onCheckedChange={(v) => updateConfig("autoReminder", v)}
            />
          </div>

          {config.autoReminder && (
            <div className="ml-7 space-y-1.5">
              <Label className="text-xs">Reminder Time (minutes before)</Label>
              <Input
                type="number"
                value={config.reminderMinutes}
                onChange={(e) => updateConfig("reminderMinutes", e.target.value)}
                min="5"
                max="1440"
              />
            </div>
          )}

          <Separator />

          <div className="flex items-center gap-3">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">No-Reply Timeout</p>
              <p className="text-xs text-muted-foreground">
                Escalate to doctor if patient doesn&apos;t respond
              </p>
            </div>
          </div>
          <div className="ml-7 space-y-1.5">
            <Label className="text-xs">Timeout (minutes)</Label>
            <Input
              type="number"
              value={config.noReplyTimeout}
              onChange={(e) => updateConfig("noReplyTimeout", e.target.value)}
              min="1"
              max="60"
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-xs">Welcome Message</Label>
          <textarea
            value={config.welcomeMessage}
            onChange={(e) => updateConfig("welcomeMessage", e.target.value)}
            rows={3}
            className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring"
          />
        </div>

        <Button className="w-full" size="sm">
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
}
