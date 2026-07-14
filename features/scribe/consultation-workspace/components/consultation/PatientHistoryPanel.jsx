"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { fetchPatientConsultationHistory } from "../../services/patient-history.client.js";

export function PatientHistoryPanel({ patient }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patient?.id) { setHistory([]); return; }
    setLoading(true);
    fetchPatientConsultationHistory(patient.id)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [patient?.id]);

  if (!patient) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-gray-500">Select a patient to view consultation history.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">Patient History</h3>
        <p className="text-xs text-gray-500">{patient.name}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : history.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-500">No prior consultations</p>
        ) : (
          <ul className="space-y-2">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-none">
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{item.chiefComplaint}</p>
                <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
                  <Calendar className="h-3 w-3" />
                  {item.date ? new Date(item.date).toLocaleDateString() : "—"}
                </p>
                <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] capitalize text-gray-600">{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
