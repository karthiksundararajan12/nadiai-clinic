"use client";

import { useState, useCallback } from "react";

const MOCK_PATIENTS = [
  {
    id: "1",
    name: "Rajesh Kumar",
    age: 45,
    gender: "Male",
    phone: "+91 98765 43210",
    email: "rajesh.kumar@email.com",
    condition: "Type 2 Diabetes",
    last_visit: "2026-05-20",
    next_appointment: "2026-05-28",
    status: "active",
    avatar: null,
  },
  {
    id: "2",
    name: "Priya Sharma",
    age: 32,
    gender: "Female",
    phone: "+91 87654 32109",
    email: "priya.sharma@email.com",
    condition: "Hypertension",
    last_visit: "2026-05-18",
    next_appointment: "2026-05-30",
    status: "active",
    avatar: null,
  },
  {
    id: "3",
    name: "Amit Patel",
    age: 58,
    gender: "Male",
    phone: "+91 76543 21098",
    email: "amit.patel@email.com",
    condition: "Cardiac Arrhythmia",
    last_visit: "2026-05-15",
    next_appointment: "2026-06-01",
    status: "active",
    avatar: null,
  },
  {
    id: "4",
    name: "Sunita Devi",
    age: 67,
    gender: "Female",
    phone: "+91 65432 10987",
    email: "sunita.devi@email.com",
    condition: "Osteoarthritis",
    last_visit: "2026-05-10",
    next_appointment: null,
    status: "inactive",
    avatar: null,
  },
  {
    id: "5",
    name: "Vikram Singh",
    age: 41,
    gender: "Male",
    phone: "+91 54321 09876",
    email: "vikram.singh@email.com",
    condition: "Asthma",
    last_visit: "2026-05-22",
    next_appointment: "2026-05-29",
    status: "active",
    avatar: null,
  },
  {
    id: "6",
    name: "Meera Joshi",
    age: 29,
    gender: "Female",
    phone: "+91 43210 98765",
    email: "meera.joshi@email.com",
    condition: "Thyroid Disorder",
    last_visit: "2026-05-19",
    next_appointment: "2026-06-02",
    status: "active",
    avatar: null,
  },
];

export function usePatients() {
  const [patients, setPatients] = useState(MOCK_PATIENTS);
  const [loading, setLoading] = useState(false);

  const addPatient = useCallback((patient) => {
    const newPatient = {
      ...patient,
      id: String(Date.now()),
      status: "active",
      last_visit: new Date().toISOString().split("T")[0],
    };
    setPatients((prev) => [newPatient, ...prev]);
    return newPatient;
  }, []);

  const updatePatient = useCallback((id, updates) => {
    setPatients((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const deletePatient = useCallback((id) => {
    setPatients((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { patients, loading, addPatient, updatePatient, deletePatient };
}
