/**
 * Row shape for `patients` inserts.
 *
 * Dashboard creates pass `consent_given` explicitly (unchecked means false
 * and a null timestamp). The WhatsApp booking flow creates a patient only
 * after the contact consents, and omits the field — that path still stamps
 * consent at insert time.
 *
 * @param {object} data
 * @param {Date} [now]
 */
export function buildPatientInsert(data, now = new Date()) {
  const source = data ?? {};
  const explicitConsent = Object.prototype.hasOwnProperty.call(source, "consent_given");
  const consentGiven = explicitConsent ? source.consent_given === true : true;

  return {
    relationship_to_contact: "self",
    ...source,
    consent_given: consentGiven,
    consent_given_at: consentGiven
      ? (explicitConsent && source.consent_given_at
          ? source.consent_given_at
          : now.toISOString())
      : null,
  };
}
