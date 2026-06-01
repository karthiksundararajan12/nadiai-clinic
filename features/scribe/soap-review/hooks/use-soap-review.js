"use client";

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useAutosave } from "../../transcript-review/hooks/use-autosave.js";
import {
  approveSOAPNote,
  compareSOAPVersions,
  fetchSOAPReviewWorkspace,
  fetchSOAPVersions,
  rejectSOAPNote,
  saveSOAPVersion,
  updateSOAPSection,
} from "../services/soap-review.client.js";
import { useSOAPRealtime } from "./use-soap-realtime.js";

export const SOAP_SECTIONS = [
  ["chiefComplaint", "Chief Complaint"],
  ["historyOfPresentIllness", "History Of Present Illness"],
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
  ["clinicalSummary", "Clinical Summary"],
];

const initialState = {
  session: null,
  note: null,
  draft: {},
  original: {},
  versions: [],
  edits: [],
  dirty: {},
  undoStack: [],
  redoStack: [],
  comparison: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "LOAD":
      return {
        ...state,
        ...action.payload,
        draft: action.payload.note?.note ?? {},
        original: action.payload.note?.original_note ?? action.payload.note?.note ?? {},
        dirty: {},
        undoStack: [],
        redoStack: [],
      };
    case "UPDATE_SECTION": {
      const before = state.draft[action.sectionKey] ?? "";
      const after = action.value;
      return {
        ...state,
        draft: { ...state.draft, [action.sectionKey]: after },
        dirty: { ...state.dirty, [action.sectionKey]: after },
        undoStack: [...state.undoStack, { sectionKey: action.sectionKey, before, after }],
        redoStack: [],
      };
    }
    case "MARK_SAVED": {
      const dirty = { ...state.dirty };
      for (const key of action.sectionKeys) delete dirty[key];
      return { ...state, dirty, note: action.note ?? state.note };
    }
    case "VERSIONS":
      return { ...state, versions: action.versions };
    case "COMPARISON":
      return { ...state, comparison: action.comparison };
    case "UNDO": {
      const item = state.undoStack[state.undoStack.length - 1];
      if (!item) return state;
      return {
        ...state,
        draft: { ...state.draft, [item.sectionKey]: item.before },
        dirty: { ...state.dirty, [item.sectionKey]: item.before },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, item],
      };
    }
    case "REDO": {
      const item = state.redoStack[state.redoStack.length - 1];
      if (!item) return state;
      return {
        ...state,
        draft: { ...state.draft, [item.sectionKey]: item.after },
        dirty: { ...state.dirty, [item.sectionKey]: item.after },
        undoStack: [...state.undoStack, item],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    default:
      return state;
  }
}

export function useSOAPReview(sessionId) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSOAPReviewWorkspace(sessionId);
      dispatch({ type: "LOAD", payload: data });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const saveSections = useCallback(async (sectionKeys = Object.keys(state.dirty), source = "autosave") => {
    if (!sectionKeys.length) return;
    setSaving(true);
    let latestNote = null;
    try {
      for (const sectionKey of sectionKeys) {
        latestNote = await updateSOAPSection(sessionId, {
          section_key: sectionKey,
          value: state.dirty[sectionKey],
          source,
        });
      }
      dispatch({ type: "MARK_SAVED", sectionKeys, note: latestNote });
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [sessionId, state.dirty]);

  const dirtyKeys = useMemo(() => Object.keys(state.dirty), [state.dirty]);
  const { autosaveStatus } = useAutosave({
    enabled: Boolean(sessionId) && state.session?.status === "SOAP_REVIEWING",
    dirtyKeys,
    onSave: (keys) => saveSections(keys, "autosave"),
  });

  const updateSection = useCallback((sectionKey, value) => {
    dispatch({ type: "UPDATE_SECTION", sectionKey, value });
  }, []);

  const manualSave = useCallback(async () => {
    await saveSections(undefined, "manual");
    const version = await saveSOAPVersion(sessionId, { source: "manual_save" });
    const versions = await fetchSOAPVersions(sessionId);
    dispatch({ type: "VERSIONS", versions: versions.versions ?? [] });
    return version;
  }, [saveSections, sessionId]);

  const approve = useCallback(async () => {
    await saveSections(undefined, "manual");
    const result = await approveSOAPNote(sessionId);
    dispatch({ type: "LOAD", payload: { ...state, session: result.session, note: result.note } });
    return result;
  }, [saveSections, sessionId, state]);

  const reject = useCallback(async (reason) => {
    await saveSections(undefined, "manual");
    const result = await rejectSOAPNote(sessionId, reason);
    dispatch({ type: "LOAD", payload: { ...state, session: result.session, note: result.note } });
    return result;
  }, [saveSections, sessionId, state]);

  const compare = useCallback(async (fromVersionId, toVersionId) => {
    const comparison = await compareSOAPVersions(sessionId, fromVersionId, toVersionId);
    dispatch({ type: "COMPARISON", comparison });
    return comparison;
  }, [sessionId]);

  useSOAPRealtime(sessionId, useCallback(() => {
    if (!dirtyKeys.length) load();
  }, [dirtyKeys.length, load]));

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  useEffect(() => {
    const handler = (event) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        manualSave();
      }
      if (meta && event.key === "Enter" && dirtyKeys.length === 0) {
        event.preventDefault();
        approve();
      }
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [approve, dirtyKeys.length, manualSave]);

  return {
    ...state,
    loading,
    saving,
    error,
    autosaveStatus,
    hasChanges: dirtyKeys.length > 0,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    load,
    updateSection,
    manualSave,
    approve,
    reject,
    compare,
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
  };
}
