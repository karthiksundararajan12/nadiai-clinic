"use client";

import { useEffect, useState } from "react";
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
import { useDoctorProfileSettings } from "@/hooks/use-doctor-profile-settings";
import { useTheme } from "@/hooks/use-theme";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { formatPhoneForDisplay } from "@/features/booking/lib/phone.js";
import {
  User,
  Building,
  Bell,
  Shield,
  Palette,
  Globe,
  Camera,
  Save,
  IndianRupee,
} from "lucide-react";

const CONSULTATION_FEE_MIN = 0;
const CONSULTATION_FEE_MAX = 100_000;

function profileInitials(fullName) {
  const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SettingsPage() {
  const {
    consultationFee,
    clinic,
    personalProfile,
    notifications,
    loading: profileSettingsLoading,
    error: profileSettingsLoadError,
    saveConsultationFee,
    saveClinicSettings,
    savePersonalProfile,
    saveNotificationSettings,
    preferences,
    savePreferences,
  } = useDoctorProfileSettings();
  const { theme } = useTheme();
  const [feeInput, setFeeInput] = useState("");
  const [feeSaving, setFeeSaving] = useState(false);
  const [feeError, setFeeError] = useState("");
  const [feeSuccess, setFeeSuccess] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    specialization: "",
    email: "",
    phone: "",
    licenseNumber: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [clinicForm, setClinicForm] = useState({
    name: "",
    phone: "",
    address: "",
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
  });
  const [clinicSaving, setClinicSaving] = useState(false);
  const [clinicError, setClinicError] = useState("");
  const [clinicSuccess, setClinicSuccess] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [remindersSaving, setRemindersSaving] = useState(false);
  const [remindersError, setRemindersError] = useState("");
  const [remindersSuccess, setRemindersSuccess] = useState("");
  const [defaultScribeLanguage, setDefaultScribeLanguage] = useState("hinglish");
  const [scribeLanguageSaving, setScribeLanguageSaving] = useState(false);
  const [scribeLanguageError, setScribeLanguageError] = useState("");
  const [scribeLanguageSuccess, setScribeLanguageSuccess] = useState("");

  useEffect(() => {
    if (!profileSettingsLoading) {
      setFeeInput(
        consultationFee === null || consultationFee === undefined
          ? ""
          : String(consultationFee),
      );
    }
  }, [consultationFee, profileSettingsLoading]);

  useEffect(() => {
    if (!profileSettingsLoading && personalProfile) {
      setProfileForm({
        fullName: personalProfile.fullName ?? "",
        specialization: personalProfile.specialization ?? "",
        email: personalProfile.email ?? "",
        phone: personalProfile.phone ? formatPhoneForDisplay(personalProfile.phone) : "",
        licenseNumber: personalProfile.licenseNumber ?? "",
      });
    }
  }, [personalProfile, profileSettingsLoading]);

  useEffect(() => {
    if (!profileSettingsLoading && clinic) {
      setClinicForm({
        name: clinic.name ?? "",
        phone: clinic.phone ? formatPhoneForDisplay(clinic.phone) : "",
        address: clinic.address ?? "",
        workingHoursStart: clinic.workingHoursStart ?? "09:00",
        workingHoursEnd: clinic.workingHoursEnd ?? "18:00",
      });
    }
  }, [clinic, profileSettingsLoading]);

  useEffect(() => {
    if (!profileSettingsLoading && notifications) {
      setRemindersEnabled(notifications.remindersEnabled ?? true);
    }
  }, [notifications, profileSettingsLoading]);

  useEffect(() => {
    if (!profileSettingsLoading && preferences) {
      setDefaultScribeLanguage(preferences.defaultScribeLanguage ?? "hinglish");
    }
  }, [preferences, profileSettingsLoading]);

  const handleSaveConsultationFee = async () => {
    setFeeError("");
    setFeeSuccess("");

    const parsedFee = Number(feeInput);
    if (
      feeInput === "" ||
      !Number.isFinite(parsedFee) ||
      !Number.isInteger(parsedFee) ||
      parsedFee < CONSULTATION_FEE_MIN ||
      parsedFee > CONSULTATION_FEE_MAX
    ) {
      setFeeError(
        `Enter a whole number between ₹${CONSULTATION_FEE_MIN} and ₹${CONSULTATION_FEE_MAX.toLocaleString("en-IN")}.`,
      );
      return;
    }

    setFeeSaving(true);
    try {
      await saveConsultationFee(parsedFee);
      setFeeSuccess("Consultation fee saved. New WhatsApp bookings will use this amount.");
    } catch (saveError) {
      setFeeError(saveError.message);
    } finally {
      setFeeSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileError("");
    setProfileSuccess("");

    setProfileSaving(true);
    try {
      await savePersonalProfile(profileForm);
      setProfileSuccess("Profile saved.");
    } catch (saveError) {
      setProfileError(saveError.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDefaultScribeLanguageChange = async (language) => {
    const previous = defaultScribeLanguage;
    setScribeLanguageError("");
    setScribeLanguageSuccess("");
    setDefaultScribeLanguage(language);
    setScribeLanguageSaving(true);

    try {
      await savePreferences({ defaultScribeLanguage: language });
      setScribeLanguageSuccess("Default Scribe language saved.");
    } catch (saveError) {
      setDefaultScribeLanguage(previous);
      setScribeLanguageError(saveError.message);
    } finally {
      setScribeLanguageSaving(false);
    }
  };

  const handleRemindersToggle = async (enabled) => {
    const previous = remindersEnabled;
    setRemindersError("");
    setRemindersSuccess("");
    setRemindersEnabled(enabled);
    setRemindersSaving(true);

    try {
      await saveNotificationSettings({ remindersEnabled: enabled });
      setRemindersSuccess(
        enabled
          ? "Patient WhatsApp reminders enabled."
          : "Patient WhatsApp reminders disabled. T-24h and T-2h reminders will not be sent.",
      );
    } catch (saveError) {
      setRemindersEnabled(previous);
      setRemindersError(saveError.message);
    } finally {
      setRemindersSaving(false);
    }
  };

  const handleSaveClinicSettings = async () => {
    setClinicError("");
    setClinicSuccess("");

    setClinicSaving(true);
    try {
      await saveClinicSettings(clinicForm);
      setClinicSuccess("Clinic information saved.");
    } catch (saveError) {
      setClinicError(saveError.message);
    } finally {
      setClinicSaving(false);
    }
  };

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
                  {(profileSettingsLoadError || profileError) && (
                    <p className="text-sm text-destructive">
                      {profileError || profileSettingsLoadError?.message}
                    </p>
                  )}
                  {profileSuccess && (
                    <p className="text-sm text-emerald-700">{profileSuccess}</p>
                  )}
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar className="h-20 w-20">
                      <AvatarFallback className="text-xl">
                        {profileInitials(profileForm.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm" className="gap-1.5" disabled>
                        <Camera className="h-3.5 w-3.5" />
                        Change Photo
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        JPG, PNG. Max 2MB. Photo upload coming soon.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="profile-full-name">Full Name</Label>
                      <Input
                        id="profile-full-name"
                        value={profileForm.fullName}
                        disabled={profileSettingsLoading || profileSaving}
                        onChange={(e) => {
                          setProfileForm((prev) => ({ ...prev, fullName: e.target.value }));
                          setProfileSuccess("");
                          setProfileError("");
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-specialization">Specialization</Label>
                      <Input
                        id="profile-specialization"
                        value={profileForm.specialization}
                        disabled={profileSettingsLoading || profileSaving}
                        onChange={(e) => {
                          setProfileForm((prev) => ({
                            ...prev,
                            specialization: e.target.value,
                          }));
                          setProfileSuccess("");
                          setProfileError("");
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-email">Email</Label>
                      <Input
                        id="profile-email"
                        type="email"
                        value={profileForm.email}
                        disabled={profileSettingsLoading || profileSaving}
                        onChange={(e) => {
                          setProfileForm((prev) => ({ ...prev, email: e.target.value }));
                          setProfileSuccess("");
                          setProfileError("");
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-phone">Phone</Label>
                      <Input
                        id="profile-phone"
                        value={profileForm.phone}
                        disabled={profileSettingsLoading || profileSaving}
                        placeholder="+91 98765 43210"
                        onChange={(e) => {
                          setProfileForm((prev) => ({ ...prev, phone: e.target.value }));
                          setProfileSuccess("");
                          setProfileError("");
                        }}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="profile-license">Medical License Number</Label>
                      <Input
                        id="profile-license"
                        value={profileForm.licenseNumber}
                        disabled={profileSettingsLoading || profileSaving}
                        onChange={(e) => {
                          setProfileForm((prev) => ({
                            ...prev,
                            licenseNumber: e.target.value,
                          }));
                          setProfileSuccess("");
                          setProfileError("");
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={handleSaveProfile}
                      disabled={
                        profileSettingsLoading ||
                        profileSaving ||
                        !profileForm.fullName.trim() ||
                        !profileForm.specialization.trim() ||
                        !profileForm.email.trim() ||
                        !profileForm.phone.trim()
                      }
                    >
                      <Save className="h-3.5 w-3.5" />
                      {profileSaving ? "Saving…" : "Save Changes"}
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
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Consultation Fee</CardTitle>
                  <CardDescription>
                    Used for WhatsApp booking payment links. Past appointments keep the amount charged at booking time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(profileSettingsLoadError || feeError) && (
                    <p className="text-sm text-destructive">
                      {feeError || profileSettingsLoadError.message}
                    </p>
                  )}
                  {feeSuccess && (
                    <p className="text-sm text-emerald-700">{feeSuccess}</p>
                  )}
                  <div className="max-w-xs space-y-2">
                    <Label htmlFor="consultation-fee">Fee per consultation</Label>
                    <div className="relative">
                      <IndianRupee className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="consultation-fee"
                        type="number"
                        min={CONSULTATION_FEE_MIN}
                        max={CONSULTATION_FEE_MAX}
                        step={1}
                        inputMode="numeric"
                        placeholder="e.g. 500"
                        value={feeInput}
                        disabled={profileSettingsLoading || feeSaving}
                        className="pl-9"
                        onChange={(e) => {
                          setFeeInput(e.target.value);
                          setFeeSuccess("");
                          setFeeError("");
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Set to ₹0 for free consultations. Whole rupees only.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={handleSaveConsultationFee}
                      disabled={profileSettingsLoading || feeSaving || feeInput === ""}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {feeSaving ? "Saving…" : "Save Fee"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clinic Information</CardTitle>
                <CardDescription>
                  Manage your clinic details and working hours
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(profileSettingsLoadError || clinicError) && (
                  <p className="text-sm text-destructive">
                    {clinicError || profileSettingsLoadError?.message}
                  </p>
                )}
                {clinicSuccess && (
                  <p className="text-sm text-emerald-700">{clinicSuccess}</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clinic-name">Clinic Name</Label>
                    <Input
                      id="clinic-name"
                      value={clinicForm.name}
                      disabled={profileSettingsLoading || clinicSaving}
                      onChange={(e) => {
                        setClinicForm((prev) => ({ ...prev, name: e.target.value }));
                        setClinicSuccess("");
                        setClinicError("");
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinic-phone">Phone</Label>
                    <Input
                      id="clinic-phone"
                      value={clinicForm.phone}
                      disabled={profileSettingsLoading || clinicSaving}
                      placeholder="+91 98765 43210"
                      onChange={(e) => {
                        setClinicForm((prev) => ({ ...prev, phone: e.target.value }));
                        setClinicSuccess("");
                        setClinicError("");
                      }}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="clinic-address">Address</Label>
                    <Input
                      id="clinic-address"
                      value={clinicForm.address}
                      disabled={profileSettingsLoading || clinicSaving}
                      onChange={(e) => {
                        setClinicForm((prev) => ({ ...prev, address: e.target.value }));
                        setClinicSuccess("");
                        setClinicError("");
                      }}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-1">Working Hours</h4>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Used for WhatsApp booking slot generation. The same hours apply every day — per-day schedules (e.g. closed Sundays) are not supported yet.
                  </p>
                  <div className="flex items-center gap-4 rounded-lg border border-border p-3">
                    <span className="w-40 text-sm font-medium">Daily</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={clinicForm.workingHoursStart}
                        disabled={profileSettingsLoading || clinicSaving}
                        className="w-28"
                        onChange={(e) => {
                          setClinicForm((prev) => ({
                            ...prev,
                            workingHoursStart: e.target.value,
                          }));
                          setClinicSuccess("");
                          setClinicError("");
                        }}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={clinicForm.workingHoursEnd}
                        disabled={profileSettingsLoading || clinicSaving}
                        className="w-28"
                        onChange={(e) => {
                          setClinicForm((prev) => ({
                            ...prev,
                            workingHoursEnd: e.target.value,
                          }));
                          setClinicSuccess("");
                          setClinicError("");
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSaveClinicSettings}
                    disabled={profileSettingsLoading || clinicSaving || !clinicForm.name.trim()}
                  >
                    <Save className="h-3.5 w-3.5" />
                    {clinicSaving ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Control WhatsApp notifications for your clinic
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(profileSettingsLoadError || remindersError) && (
                  <p className="text-sm text-destructive">
                    {remindersError || profileSettingsLoadError?.message}
                  </p>
                )}
                {remindersSuccess && (
                  <p className="text-sm text-emerald-700">{remindersSuccess}</p>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Appointment Reminders</p>
                      <p className="text-xs text-muted-foreground">
                        Send WhatsApp reminders to patients T-24h and T-2h before their visit
                      </p>
                    </div>
                    <Switch
                      checked={remindersEnabled}
                      disabled={profileSettingsLoading || remindersSaving}
                      onCheckedChange={handleRemindersToggle}
                    />
                  </div>
                  <Separator className="mt-4" />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Scribe Completion</p>
                      <p className="text-xs text-muted-foreground">
                        Notify when AI clinical notes are ready
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Coming soon</Badge>
                      <Switch checked={false} disabled />
                    </div>
                  </div>
                </div>
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
                  {(profileSettingsLoadError || scribeLanguageError) && (
                    <p className="text-sm text-destructive">
                      {scribeLanguageError || profileSettingsLoadError?.message}
                    </p>
                  )}
                  {scribeLanguageSuccess && (
                    <p className="text-sm text-emerald-700">{scribeLanguageSuccess}</p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Default Scribe Language</p>
                        <p className="text-xs text-muted-foreground">
                          Pre-selected on the Scribe page — you can still change it per session
                        </p>
                      </div>
                    </div>
                    <LanguageToggle
                      value={defaultScribeLanguage}
                      disabled={profileSettingsLoading || scribeLanguageSaving}
                      onChange={handleDefaultScribeLanguageChange}
                    />
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
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Palette className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Theme</p>
                        <p className="text-xs text-muted-foreground">
                          Use the sun/moon icon in the top bar to switch between light and dark mode
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">
                      {theme}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Compact Mode</p>
                      <p className="text-xs text-muted-foreground">
                        Reduce spacing for more content
                      </p>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Sidebar Collapsed</p>
                      <p className="text-xs text-muted-foreground">
                        Start with collapsed sidebar
                      </p>
                    </div>
                    <Switch checked={false} disabled />
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
