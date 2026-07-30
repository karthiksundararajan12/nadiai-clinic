"use client";

import { useCallback, useState } from "react";
import {
  approvePrescription,
  fetchPrescriptionWorkspace,
  generatePrescription,
  updatePrescriptionDraft,
} from "../services/prescription-review.client.js";
import {
  assertDoctorRegistrationForApproval,
  hasDoctorRegistrationNumber,
  MISSING_DOCTOR_REGISTRATION_CODE,
} from "../../lib/prescription-registration-gate.js";

import {
  MANUAL_MEDICATION_CONFIDENCE,
} from "../../lib/prescription-medication-suggestions.js";

const EMPTY_MEDICATION = {
  name: "",
  dosage: "",
  frequency: "1-0-1",
  duration: "",
  instructions: "",
  confidence: MANUAL_MEDICATION_CONFIDENCE,
};

export const EMPTY_PRESCRIPTION_DRAFT = {
  diagnosis: [],
  medications: [],
  investigations: [],
  advice: [],
  followUpInstructions: "",
  followUpDays: undefined,
  warnings: [],
};

/**
 * @param {string|null} sessionId
 */
export function usePrescriptionPanel(sessionId) {
  const [draft, setDraft] = useState(EMPTY_PRESCRIPTION_DRAFT);
  const [doctor, setDoctor] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState(null);
  const [approvalError, setApprovalError] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const loadDoctorFallback = useCallback(async () => {
    try {
      const res = await fetch("/api/doctor-profile", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      const personal = payload.personalProfile;
      if (!personal) return null;
      const profile = {
        full_name: personal.fullName || null,
        specialization: personal.specialization || null,
        clinic_name: payload.clinic?.name || null,
        clinic_address: payload.clinic?.address || null,
        license_number: personal.licenseNumber?.trim()
          ? personal.licenseNumber.trim()
          : null,
      };
      setDoctor(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!sessionId) return null;
    const workspace = await fetchPrescriptionWorkspace(sessionId);
    if (workspace?.draft?.draft) {
      setDraft(workspace.draft.draft);
    }
    if (workspace?.doctor) {
      setDoctor(workspace.doctor);
    } else {
      await loadDoctorFallback();
    }
    if (
      workspace?.draft?.status === "approved" ||
      workspace?.session?.status === "PRESCRIPTION_APPROVED"
    ) {
      setApproved(true);
    }
    return workspace;
  }, [sessionId, loadDoctorFallback]);

  const generate = useCallback(async (options = {}) => {
    if (!sessionId) return;
    setGenerating(true);
    setError(null);
    setApprovalError(null);
    setPanelOpen(true);
    setApproved(false);

    try {
      await generatePrescription(sessionId, options);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [sessionId, loadWorkspace]);

  const enterManual = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    setError(null);
    setApprovalError(null);
    setPanelOpen(true);
    setApproved(false);

    try {
      await generatePrescription(sessionId, { manual: true });
      await loadWorkspace();
    } catch (err) {
      setDraft({ ...EMPTY_PRESCRIPTION_DRAFT, medications: [{ ...EMPTY_MEDICATION }] });
      setError(null);
      await loadDoctorFallback();
    } finally {
      setGenerating(false);
    }
  }, [sessionId, loadWorkspace, loadDoctorFallback]);

  const updateDraft = useCallback((updater) => {
    setDraft((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const saveDraft = useCallback(async (draftData) => {
    if (!sessionId) return;
    await updatePrescriptionDraft(sessionId, draftData, "manual_edit");
  }, [sessionId]);

  const approve = useCallback(async () => {
    if (!sessionId) return;
    setApproving(true);
    setApprovalError(null);
    try {
      let doctorForGate = doctor;
      if (!hasDoctorRegistrationNumber(doctorForGate)) {
        doctorForGate = (await loadDoctorFallback()) ?? doctorForGate;
      }
      assertDoctorRegistrationForApproval(doctorForGate);

      await saveDraft(draft);
      await approvePrescription(sessionId);
      setApproved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRegistrationGate =
        err?.code === MISSING_DOCTOR_REGISTRATION_CODE ||
        /registration number/i.test(message);
      if (isRegistrationGate) {
        const gateError = err instanceof Error ? err : new Error(message);
        gateError.code = MISSING_DOCTOR_REGISTRATION_CODE;
        setApprovalError(gateError);
      }
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setApproving(false);
    }
  }, [sessionId, draft, doctor, saveDraft, loadDoctorFallback]);

  const discard = useCallback(() => {
    setPanelOpen(false);
    setApproved(false);
    setError(null);
    setApprovalError(null);
    setDraft(EMPTY_PRESCRIPTION_DRAFT);
  }, []);

  const addMedication = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      medications: [...(prev.medications ?? []), { ...EMPTY_MEDICATION }],
    }));
  }, []);

  const updateMedication = useCallback((index, med) => {
    setDraft((prev) => ({
      ...prev,
      medications: prev.medications.map((m, i) => (i === index ? med : m)),
    }));
  }, []);

  const removeMedication = useCallback((index) => {
    setDraft((prev) => ({
      ...prev,
      medications: prev.medications.filter((_, i) => i !== index),
    }));
  }, []);

  const reset = useCallback(() => {
    setPanelOpen(false);
    setApproved(false);
    setError(null);
    setApprovalError(null);
    setGenerating(false);
    setApproving(false);
    setDraft(EMPTY_PRESCRIPTION_DRAFT);
    setDoctor(null);
  }, []);

  return {
    draft,
    doctor,
    setDoctor,
    generating,
    approving,
    approved,
    error,
    approvalError,
    panelOpen,
    setPanelOpen,
    generate,
    enterManual,
    loadWorkspace,
    updateDraft,
    approve,
    discard,
    addMedication,
    updateMedication,
    removeMedication,
    reset,
    registrationComplete: hasDoctorRegistrationNumber(doctor),
  };
}
