"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Building,
  Bell,
  Shield,
  Palette,
  Globe,
  Camera,
  Save,
} from "lucide-react";

export default function SettingsPage() {
  const [profile, setProfile] = useState({
    name: "Dr. Ananya Mehta",
    email: "dr.ananya@nadiai.com",
    phone: "+91 98765 43210",
    specialization: "Cardiologist",
    license: "MCI-123456",
    clinic: "Nadi Heart Care Clinic",
    address: "123, MG Road, Bengaluru, Karnataka 560001",
  });

  const [notifications, setNotifications] = useState({
    appointments: true,
    email: false,
    sms: true,
    scribeComplete: true,
    dailyDigest: false,
  });

  return (
    <>
      <Header title="Settings" subtitle="Manage your account and preferences" />

      <div className="flex-1 p-6">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-3.5 w-3.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="clinic" className="gap-1.5">
              <Building className="h-3.5 w-3.5" />
              Clinic
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Update your personal details and medical credentials
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-20 w-20">
                      <AvatarFallback className="text-xl">AM</AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Camera className="h-3.5 w-3.5" />
                        Change Photo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        JPG, PNG. Max 2MB.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input
                        value={profile.name}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Specialization</Label>
                      <Input
                        value={profile.specialization}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            specialization: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Medical License Number</Label>
                      <Input
                        value={profile.license}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            license: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button size="sm" className="gap-1.5">
                      <Save className="h-3.5 w-3.5" />
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Account Status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Plan
                      </span>
                      <Badge>Professional</Badge>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status
                      </span>
                      <Badge variant="success">Active</Badge>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Joined
                      </span>
                      <span className="text-sm">Jan 2026</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Security</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      Change Password
                    </Button>
                    <Button variant="outline" size="sm" className="w-full gap-1.5">
                      Enable 2FA
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="clinic">
            <Card>
              <CardHeader>
                <CardTitle>Clinic Information</CardTitle>
                <CardDescription>
                  Manage your clinic details and working hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Clinic Name</Label>
                    <Input
                      value={profile.clinic}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, clinic: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value="+91 80 4567 8901" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Address</Label>
                    <Input
                      value={profile.address}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, address: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Working Hours</h4>
                  <div className="grid gap-3">
                    {[
                      { day: "Monday - Friday", start: "09:00", end: "18:00" },
                      { day: "Saturday", start: "09:00", end: "14:00" },
                      { day: "Sunday", start: "", end: "" },
                    ].map((schedule, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 rounded-lg border border-border p-3"
                      >
                        <span className="w-40 text-sm font-medium">
                          {schedule.day}
                        </span>
                        {schedule.start ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              defaultValue={schedule.start}
                              className="w-28"
                            />
                            <span className="text-sm text-muted-foreground">
                              to
                            </span>
                            <Input
                              type="time"
                              defaultValue={schedule.end}
                              className="w-28"
                            />
                          </div>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button size="sm" className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose how and when you want to be notified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    key: "appointments",
                    title: "Appointment Reminders",
                    desc: "Get notified about upcoming appointments",
                  },
                  {
                    key: "sms",
                    title: "SMS Notifications",
                    desc: "Receive important updates via SMS",
                  },
                  {
                    key: "scribeComplete",
                    title: "Scribe Completion",
                    desc: "Notify when AI clinical notes are ready",
                  },
                  {
                    key: "email",
                    title: "Email Notifications",
                    desc: "Receive daily email summaries",
                  },
                  {
                    key: "dailyDigest",
                    title: "Daily Digest",
                    desc: "Morning summary of the day's schedule",
                  },
                ].map((item) => (
                  <div key={item.key}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.desc}
                        </p>
                      </div>
                      <Switch
                        checked={notifications[item.key]}
                        onCheckedChange={(v) =>
                          setNotifications((prev) => ({
                            ...prev,
                            [item.key]: v,
                          }))
                        }
                      />
                    </div>
                    <Separator className="mt-4" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Language & Region</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Default Scribe Language</p>
                        <p className="text-xs text-muted-foreground">
                          Language for voice transcription
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary">Hinglish</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Date Format</p>
                      <p className="text-xs text-muted-foreground">
                        How dates are displayed
                      </p>
                    </div>
                    <Badge variant="secondary">DD/MM/YYYY</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Time Zone</p>
                      <p className="text-xs text-muted-foreground">
                        Your local time zone
                      </p>
                    </div>
                    <Badge variant="secondary">IST (UTC+5:30)</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Theme</p>
                        <p className="text-xs text-muted-foreground">
                          Select your preferred theme
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { label: "Light", active: true },
                        { label: "Dark", active: false },
                        { label: "System", active: false },
                      ].map((theme) => (
                        <button
                          key={theme.label}
                          className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                            theme.active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {theme.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Compact Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Reduce spacing for more content
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Sidebar Collapsed</p>
                      <p className="text-xs text-muted-foreground">
                        Start with collapsed sidebar
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
