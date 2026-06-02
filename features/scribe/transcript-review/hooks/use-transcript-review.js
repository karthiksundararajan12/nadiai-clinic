"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  completeTranscriptReview,
  fetchTranscriptVersions,
  fetchTranscriptWorkspace,
  generateSOAPNote,
  restoreTranscriptVersion,
  saveTranscriptVersion,
  updateTranscriptSegment,
} from "../services/transcript-review.client.js";
import { useAutosave } from "./use-autosave.js";
import { useTranscriptRealtime } from "./use-transcript-realtime.js";

const initialState = {
  session: null,
  transcription: null,
  segments: [],
  versions: [],
  dirty: {},
  undoStack: [],
  redoStack: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "RESET":
      return initialState;
    case "LOAD":
      return { ...state, ...action.payload, dirty: {}, undoStack: [], redoStack: [] };
    case "UPDATE_SEGMENT": {
      const before = state.segments.find((s) => s.id === action.segmentId);
      const segments = state.segments.map((segment) =>
        segment.id === action.segmentId ? { ...segment, ...action.patch } : segment,
      );
      return {
        ...state,
        segments,
        dirty: { ...state.dirty, [action.segmentId]: action.patch },
        undoStack: before ? [...state.undoStack, { segmentId: action.segmentId, before, after: { ...before, ...action.patch } }] : state.undoStack,
        redoStack: [],
      };
    }
    case "MARK_SAVED": {
      const nextDirty = { ...state.dirty };
      for (const key of action.segmentIds) delete nextDirty[key];
      return { ...state, dirty: nextDirty };
    }
    case "UNDO": {
      const item = state.undoStack[state.undoStack.length - 1];
      if (!item) return state;
      return {
        ...state,
        segments: state.segments.map((s) => (s.id === item.segmentId ? item.before : s)),
        dirty: { ...state.dirty, [item.segmentId]: diffSegment(item.before, item.after) },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, item],
      };
    }
    case "REDO": {
      const item = state.redoStack[state.redoStack.length - 1];
      if (!item) return state;
      return {
        ...state,
        segments: state.segments.map((s) => (s.id === item.segmentId ? item.after : s)),
        dirty: { ...state.dirty, [item.segmentId]: diffSegment(item.after, item.before) },
        undoStack: [...state.undoStack, item],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    case "VERSIONS":
      return { ...state, versions: action.versions };
    default:
      return state;
  }
}

export function useTranscriptReview(sessionId) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingSOAP, setGeneratingSOAP] = useState(false);
  const [error, setError] = useState(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setLoading(Boolean(sessionId));
    setError(null);
  }, [sessionId]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTranscriptWorkspace(sessionId);
      if (requestId !== loadRequestRef.current) return;
      setReadOnly(Boolean(data?.readOnly));
      dispatch({ type: "LOAD", payload: data });
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setError(err);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [sessionId]);

  const saveSegments = useCallback(async (segmentIds = Object.keys(state.dirty)) => {
    if (!segmentIds.length) return;
    setSaving(true);
    try {
      for (const segmentId of segmentIds) {
        const patch = state.dirty[segmentId];
        if (patch) await updateTranscriptSegment(sessionId, segmentId, patch);
      }
      dispatch({ type: "MARK_SAVED", segmentIds });
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [sessionId, state.dirty]);

  const dirtyKeys = useMemo(() => Object.keys(state.dirty), [state.dirty]);
  const { autosaveStatus } = useAutosave({
    enabled: Boolean(sessionId) && !readOnly,
    dirtyKeys,
    onSave: saveSegments,
  });

  const updateSegment = useCallback((segmentId, patch) => {
    dispatch({ type: "UPDATE_SEGMENT", segmentId, patch });
  }, []);

  const manualSave = useCallback(async () => {
    await saveSegments();
    const version = await saveTranscriptVersion(sessionId, { source: "manual_save" });
    const versions = await fetchTranscriptVersions(sessionId);
    dispatch({ type: "VERSIONS", versions: versions.versions ?? [] });
    return version;
  }, [saveSegments, sessionId]);

  const completeReview = useCallback(async () => {
    await saveSegments();
    const result = await completeTranscriptReview(sessionId);
    dispatch({ type: "LOAD", payload: { ...state, session: result.session } });
    return result;
  }, [saveSegments, sessionId, state]);

  const generateSOAP = useCallback(async () => {
    if (dirtyKeys.length > 0) {
      await saveSegments();
    }
    setGeneratingSOAP(true);
    setError(null);
    try {
      const result = await generateSOAPNote(sessionId);
      await load();
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setGeneratingSOAP(false);
    }
  }, [dirtyKeys.length, load, saveSegments, sessionId]);

  const restoreVersion = useCallback(async (versionId) => {
    const result = await restoreTranscriptVersion(sessionId, versionId);
    await load();
    return result;
  }, [load, sessionId]);

  const onRealtimeChange = useCallback(() => {
    load();
  }, [load]);

  useTranscriptRealtime(sessionId, onRealtimeChange);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  return {
    ...state,
    readOnly,
    loading,
    saving,
    generatingSOAP,
    error,
    autosaveStatus,
    hasChanges: dirtyKeys.length > 0,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
    load,
    updateSegment,
    manualSave,
    completeReview,
    generateSOAP,
    restoreVersion,
    undo: () => dispatch({ type: "UNDO" }),
    redo: () => dispatch({ type: "REDO" }),
  };
}

function diffSegment(next, prev) {
  const diff = {};
  for (const key of ["text", "speaker", "speaker_label"]) {
    if (next[key] !== prev[key]) diff[key] = next[key];
  }
  return diff;
}
