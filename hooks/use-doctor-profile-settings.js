"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const DoctorProfileSettingsContext = createContext(null);

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load doctor profile settings");
  }
  return payload;
}

/**
 * Shared doctor profile settings for the dashboard (sidebar avatar + settings page).
 * Fetches /api/doctor-profile once; mutations update the same context so the
 * navbar avatar refreshes immediately after a profile photo upload.
 */
export function DoctorProfileSettingsProvider({ children }) {
  const [consultationFee, setConsultationFee] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [personalProfile, setPersonalProfile] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await readResponse(
        await fetch("/api/doctor-profile", { cache: "no-store", signal }),
      );
      setConsultationFee(payload.consultationFee ?? null);
      setClinic(payload.clinic ?? null);
      setPersonalProfile(payload.profile ?? null);
      setNotifications(payload.notifications ?? null);
      setPreferences(payload.preferences ?? null);
    } catch (loadError) {
      if (loadError.name !== "AbortError") {
        setError(loadError);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const saveConsultationFee = useCallback(async (fee) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultationFee: fee }),
      }),
    );
    setConsultationFee(payload.consultationFee ?? null);
    return payload;
  }, []);

  const saveClinicSettings = useCallback(async (clinicInput) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinic: clinicInput }),
      }),
    );
    if (payload.clinic) {
      setClinic(payload.clinic);
    }
    return payload;
  }, []);

  const savePersonalProfile = useCallback(async (profileInput) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileInput }),
      }),
    );
    if (payload.profile) {
      setPersonalProfile(payload.profile);
    }
    return payload;
  }, []);

  const saveNotificationSettings = useCallback(async (notificationInput) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: notificationInput }),
      }),
    );
    if (payload.notifications) {
      setNotifications(payload.notifications);
    }
    return payload;
  }, []);

  const savePreferences = useCallback(async (preferencesInput) => {
    setError(null);
    const payload = await readResponse(
      await fetch("/api/doctor-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: preferencesInput }),
      }),
    );
    if (payload.preferences) {
      setPreferences(payload.preferences);
    }
    return payload;
  }, []);

  const uploadProfilePhoto = useCallback(async (file) => {
    setError(null);
    const body = new FormData();
    body.append("photo", file);
    const payload = await readResponse(
      await fetch("/api/doctor-profile/avatar", {
        method: "POST",
        body,
      }),
    );
    if (payload.profile) {
      setPersonalProfile(payload.profile);
    }
    return payload;
  }, []);

  const refreshPublic = useCallback(
    (signal) => load(signal instanceof AbortSignal ? signal : undefined),
    [load],
  );

  const value = useMemo(
    () => ({
      consultationFee,
      clinic,
      personalProfile,
      notifications,
      preferences,
      loading,
      error,
      saveConsultationFee,
      saveClinicSettings,
      savePersonalProfile,
      saveNotificationSettings,
      savePreferences,
      uploadProfilePhoto,
      refresh: refreshPublic,
    }),
    [
      consultationFee,
      clinic,
      personalProfile,
      notifications,
      preferences,
      loading,
      error,
      saveConsultationFee,
      saveClinicSettings,
      savePersonalProfile,
      saveNotificationSettings,
      savePreferences,
      uploadProfilePhoto,
      refreshPublic,
    ],
  );

  return (
    <DoctorProfileSettingsContext.Provider value={value}>
      {children}
    </DoctorProfileSettingsContext.Provider>
  );
}

export function useDoctorProfileSettings() {
  const context = useContext(DoctorProfileSettingsContext);
  if (!context) {
    throw new Error(
      "useDoctorProfileSettings must be used within DoctorProfileSettingsProvider",
    );
  }
  return context;
}
