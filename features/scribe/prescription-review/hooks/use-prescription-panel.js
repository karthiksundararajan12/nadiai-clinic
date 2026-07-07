"use client";

import { useCallback, useState } from "react";
import {
  approvePrescription,
  fetchPrescriptionWorkspace,
  generatePrescription,
  updatePrescriptionDraft,
} from "../services/prescription-review.client.js";

const EMPTY_MEDICATION = {
  name: "",
  dosage: "",
  frequency: "1-0-1",
  duration: "",
  instructions: "",
  confidence: 1,
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
  const [panelOpen, setPanelOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!sessionId) return null;
    const workspace = await fetchPrescriptionWorkspace(sessionId);
    if (workspace?.draft?.draft) {
      setDraft(workspace.draft.draft);
    }
    if (
      workspace?.draft?.status === "approved" ||
      workspace?.session?.status === "PRESCRIPTION_APPROVED"
    ) {
      setApproved(true);
    }
    return workspace;
  }, [sessionId]);

  const generate = useCallback(async (options = {}) => {
    if (!sessionId) return;
    setGenerating(true);
    setError(null);
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
    setPanelOpen(true);
    setApproved(false);

    try {
      await generatePrescription(sessionId, { manual: true });
      await loadWorkspace();
    } catch (err) {
      setDraft({ ...EMPTY_PRESCRIPTION_DRAFT, medications: [{ ...EMPTY_MEDICATION }] });
      setError(null);
    } finally {
      setGenerating(false);
    }
  }, [sessionId, loadWorkspace]);

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
    setError(null);
    try {
      await saveDraft(draft);
      await approvePrescription(sessionId);
      setApproved(true);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      setApproving(false);
    }
  }, [sessionId, draft, saveDraft]);

  const discard = useCallback(() => {
    setPanelOpen(false);
    setApproved(false);
    setError(null);
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
  };
}
