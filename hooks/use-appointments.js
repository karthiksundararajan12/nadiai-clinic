"use client";

import { useState, useCallback } from "react";

const MOCK_APPOINTMENTS = [
  {
    id: "apt-001",
    patient_name: "Rajesh Kumar",
    patient_id: "1",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-25",
    time: "09:00",
    duration: 30,
    type: "Follow-up",
    status: "confirmed",
    notes: "Diabetes follow-up, check HbA1c levels",
    source: "online",
  },
  {
    id: "apt-002",
    patient_name: "Priya Sharma",
    patient_id: "2",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-25",
    time: "09:30",
    duration: 30,
    type: "Consultation",
    status: "scheduled",
    notes: "Blood pressure monitoring",
    source: "direct",
  },
  {
    id: "apt-003",
    patient_name: "Amit Patel",
    patient_id: "3",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-25",
    time: "10:00",
    duration: 45,
    type: "Check-up",
    status: "in_progress",
    notes: "Cardiac evaluation, ECG review",
    source: "online",
  },
  {
    id: "apt-004",
    patient_name: "Vikram Singh",
    patient_id: "5",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-25",
    time: "11:00",
    duration: 30,
    type: "Follow-up",
    status: "scheduled",
    notes: "Asthma medication review",
    source: "direct",
  },
  {
    id: "apt-005",
    patient_name: "Meera Joshi",
    patient_id: "6",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-26",
    time: "09:00",
    duration: 30,
    type: "Consultation",
    status: "confirmed",
    notes: "Thyroid level check",
    source: "online",
  },
  {
    id: "apt-006",
    patient_name: "Sunita Devi",
    patient_id: "4",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-24",
    time: "14:00",
    duration: 30,
    type: "Follow-up",
    status: "completed",
    notes: "Joint pain review, X-ray discussion",
    source: "direct",
  },
  {
    id: "apt-007",
    patient_name: "Rajesh Kumar",
    patient_id: "1",
    doctor: "Dr. Ananya Mehta",
    date: "2026-05-23",
    time: "10:00",
    duration: 30,
    type: "Check-up",
    status: "completed",
    notes: "Routine diabetes check",
    source: "online",
  },
];

export function useAppointments() {
  const [appointments, setAppointments] = useState(MOCK_APPOINTMENTS);
  const [loading, setLoading] = useState(false);

  const addAppointment = useCallback((appointment) => {
    const newApt = {
      ...appointment,
      id: `apt-${String(Date.now()).slice(-6)}`,
      status: "scheduled",
    };
    setAppointments((prev) => [newApt, ...prev]);
    return newApt;
  }, []);

  const updateAppointment = useCallback((id, updates) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  }, []);

  const cancelAppointment = useCallback((id) => {
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a))
    );
  }, []);

  const todayAppointments = appointments.filter(
    (a) => a.date === new Date().toISOString().split("T")[0]
  );

  return {
    appointments,
    todayAppointments,
    loading,
    addAppointment,
    updateAppointment,
    cancelAppointment,
  };
}
