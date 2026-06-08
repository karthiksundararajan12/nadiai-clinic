"use client";

import { useEffect } from "react";

/**
 * Warns before page unload when there are unsaved edits.
 */
export function useUnsavedGuard(hasUnsavedChanges, message = "You have unsaved changes. Leave anyway?") {
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;

    const handler = (event) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges, message]);
}
