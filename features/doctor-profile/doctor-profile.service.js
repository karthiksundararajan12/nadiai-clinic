export const CONSULTATION_FEE_MIN_RUPEES = 0;
export const CONSULTATION_FEE_MAX_RUPEES = 100_000;

export class DoctorProfileRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "DoctorProfileRequestError";
    this.statusCode = statusCode;
  }
}

function normalizeStoredFee(value) {
  if (value === null || value === undefined) return null;
  const fee = Number(value);
  return Number.isFinite(fee) ? fee : null;
}

function parseFeeInput(rawFee) {
  if (rawFee === null || rawFee === undefined || rawFee === "") {
    throw new DoctorProfileRequestError("Consultation fee is required");
  }

  const fee = Number(rawFee);
  if (
    !Number.isFinite(fee) ||
    !Number.isInteger(fee) ||
    fee < CONSULTATION_FEE_MIN_RUPEES ||
    fee > CONSULTATION_FEE_MAX_RUPEES
  ) {
    throw new DoctorProfileRequestError(
      `Consultation fee must be a whole number between ${CONSULTATION_FEE_MIN_RUPEES} and ${CONSULTATION_FEE_MAX_RUPEES} rupees`,
    );
  }

  return fee;
}

export class DoctorProfileService {
  constructor(doctorProfileRepository) {
    this._doctors = doctorProfileRepository;
  }

  async getConsultationFee(clinicId, userId) {
    const profile = await this._doctors.findByUserId(clinicId, userId);
    if (!profile) {
      throw new DoctorProfileRequestError("Doctor profile not found", 404);
    }

    return { consultationFee: normalizeStoredFee(profile.consultation_fee) };
  }

  async updateConsultationFee(clinicId, userId, rawFee) {
    const fee = parseFeeInput(rawFee);
    const profile = await this._doctors.findByUserId(clinicId, userId);
    if (!profile) {
      throw new DoctorProfileRequestError("Doctor profile not found", 404);
    }

    const updated = await this._doctors.updateConsultationFee(clinicId, userId, fee);
    return { consultationFee: normalizeStoredFee(updated.consultation_fee) };
  }
}
