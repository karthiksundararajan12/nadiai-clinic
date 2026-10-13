"use client";

import { Button } from "@/components/ui/button";
import { patientNamesMatch } from "../lib/patient-identity.js";

export const WHATSAPP_CONSENT_LABEL = "Patient has consented to WhatsApp communication";
export const WHATSAPP_CONSENT_NOTE =
  "No WhatsApp reminders or prescriptions will be sent without consent.";
export const USE_EXISTING_PATIENT_LABEL = "Use this patient";
export const ADD_FAMILY_MEMBER_LABEL = "Add anyway (family member)";

/**
 * @param {string} fullName
 * @returns {string}
 */
export function duplicatePatientMessage(fullName) {
  return `A patient with this number already exists: ${fullName}`;
}

/**
 * Unchecked unless the user checks it. Callers must not pass a derived
 * default — only the checkbox itself sets consent.
 *
 * @param {{
 *   id: string;
 *   checked: boolean;
 *   disabled?: boolean;
 *   onChange: (checked: boolean) => void;
 * }} props
 */
export function WhatsAppConsentField({ id, checked, disabled = false, onChange }) {
  const noteId = `${id}-note`;
  const consented = checked === true;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={consented}
          disabled={disabled}
          autoComplete="off"
          data-testid="patient-whatsapp-consent"
          aria-describedby={consented ? undefined : noteId}
          className="mt-0.5 h-4 w-4 rounded border-input"
          onChange={(event) => onChange(event.target.checked === true)}
        />
        <span className="text-sm font-medium text-foreground">{WHATSAPP_CONSENT_LABEL}</span>
      </label>
      {consented ? null : (
        <p
          id={noteId}
          className="text-xs font-medium text-muted-foreground"
          data-testid="patient-whatsapp-consent-note"
        >
          {WHATSAPP_CONSENT_NOTE}
        </p>
      )}
    </div>
  );
}

/**
 * @param {{
 *   fullName: string;
 *   typedName?: string;
 *   disabled?: boolean;
 *   onUseExisting: () => void;
 *   onAddAnyway: () => void;
 * }} props
 */
export function DuplicatePatientNotice({
  fullName,
  typedName = "",
  disabled = false,
  onUseExisting,
  onAddAnyway,
}) {
  const allowAddAnyway = !patientNamesMatch(typedName, fullName);

  return (
    <div
      role="alert"
      data-testid="duplicate-patient-notice"
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
    >
      <p className="text-sm font-medium text-foreground">{duplicatePatientMessage(fullName)}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          data-testid="use-existing-patient"
          onClick={onUseExisting}
        >
          {USE_EXISTING_PATIENT_LABEL}
        </Button>
        {allowAddAnyway ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            data-testid="add-family-member"
            onClick={onAddAnyway}
          >
            {ADD_FAMILY_MEMBER_LABEL}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
