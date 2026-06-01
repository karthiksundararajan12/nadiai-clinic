"use client";

import { useEffect, useRef, useState } from "react";

export function useAutosave({ enabled, dirtyKeys, delayMs = 1200, onSave }) {
  const [status, setStatus] = useState("idle");
  const timerRef = useRef(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!enabled || dirtyKeys.length === 0) {
      return;
    }

    queueMicrotask(() => setStatus("pending"));
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        setStatus("saving");
        await onSaveRef.current?.(dirtyKeys);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, delayMs);

    return () => clearTimeout(timerRef.current);
  }, [enabled, dirtyKeys, delayMs]);

  return { autosaveStatus: status };
}
