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
