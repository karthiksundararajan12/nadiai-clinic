/** User-facing copy when Gemini SOAP generation fails but the transcript is safe. */
export const SOAP_GENERATION_FAILURE_MESSAGE =
  "Couldn't generate the clinical note. Your transcript is saved — click Retry.";

/**
 * Resolves which empty-state variant the SOAP panel should show.
 *
 * @param {{
 *   hasTranscript: boolean;
 *   generating: boolean;
 *   error?: Error | null;
 * }} input
 * @returns {{
 *   variant: "generating" | "error" | "pending" | "idle";
 *   message: string | null;
 *   showRetry: boolean;
 * }}
 */
export function resolveSoapEmptyPresentation({ hasTranscript, generating, error }) {
  if (generating) {
    return {
      variant: "generating",
      message: "Generating SOAP note…",
      showRetry: false,
    };
  }

  if (error && hasTranscript) {
    return {
      variant: "error",
      message: formatSoapGenerationError(error),
      showRetry: true,
    };
  }

  if (hasTranscript) {
    return {
      variant: "pending",
      message: "SOAP note will appear here after generation.",
      showRetry: false,
    };
  }

  return {
    variant: "idle",
    message: "Start a recording to generate a SOAP note.",
    showRetry: false,
  };
}

/**
 * @param {Error | null | undefined} error
 */
export function formatSoapGenerationError(error) {
  if (!error?.message) return SOAP_GENERATION_FAILURE_MESSAGE;
  return error.message.includes("transcript is saved")
    ? error.message
    : SOAP_GENERATION_FAILURE_MESSAGE;
}

/**
 * Whether the doctor can manually trigger SOAP generation from the toolbar.
 *
 * @param {{
 *   readOnly: boolean;
 *   waitingForTranscript: boolean;
 *   segmentCount: number;
 *   generating: boolean;
 *   hasSoap: boolean;
 *   transcriptWorkspaceAvailable: boolean;
 *   soapApproved: boolean;
 * }} input
 */
export function canManualGenerateSOAP({
  readOnly,
  waitingForTranscript,
  segmentCount,
  generating,
  hasSoap,
  transcriptWorkspaceAvailable,
  soapApproved,
}) {
  return (
    !soapApproved &&
    !readOnly &&
    !waitingForTranscript &&
    segmentCount > 0 &&
    !generating &&
    !hasSoap &&
    transcriptWorkspaceAvailable
  );
}

/**
 * Runs one SOAP generation attempt. Used by workspace auto + manual retry paths.
 *
 * @param {() => Promise<void>} generate
 * @returns {Promise<{ ok: true } | { ok: false; error: Error }>}
 */
export async function runSoapGenerationAttempt(generate) {
  try {
    await generate();
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return { ok: false, error };
  }
}
