import { normalizePhoneForWhatsApp } from "../booking/lib/phone.js";
import { createLogger } from "../booking/logger.js";
import { SCRIBE_LANGUAGE } from "../scribe/constants.js";
import { PROFILE_PHOTO } from "./profile-photo.constants.js";

export const CONSULTATION_FEE_MIN_RUPEES = 0;
export const CONSULTATION_FEE_MAX_RUPEES = 100_000;

const MIME_TO_EXTENSION = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

const VALID_SCRIBE_LANGUAGES = new Set(Object.values(SCRIBE_LANGUAGE));
const DEFAULT_SCRIBE_LANGUAGE = SCRIBE_LANGUAGE.HINGLISH;

const WORKING_HOURS_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

function parseClinicName(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) {
    throw new DoctorProfileRequestError("Clinic name is required");
  }
  return name;
}

function parseIndianMobilePhone(rawPhone, label = "Phone") {
  const digits = normalizePhoneForWhatsApp(rawPhone);
  if (!digits) {
    throw new DoctorProfileRequestError(`${label} is required`);
  }

  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  throw new DoctorProfileRequestError(
    "Enter a valid Indian mobile number (10 digits, or +91 followed by 10 digits)",
  );
}

function parseClinicPhone(rawPhone) {
  return parseIndianMobilePhone(rawPhone, "Clinic phone");
}

function parseClinicAddress(rawAddress) {
  const address = String(rawAddress ?? "").trim();
  return address || null;
}

function parseWorkingHours(start, end) {
  const startValue = String(start ?? "").trim();
  const endValue = String(end ?? "").trim();

  if (!WORKING_HOURS_PATTERN.test(startValue) || !WORKING_HOURS_PATTERN.test(endValue)) {
    throw new DoctorProfileRequestError("Working hours must use HH:mm format");
  }
  if (endValue <= startValue) {
    throw new DoctorProfileRequestError("Closing time must be after opening time");
  }

  return { start: startValue, end: endValue };
}

function formatClinicSettings(clinic, profile) {
  return {
    name: clinic?.name ?? "",
    phone: clinic?.phone ?? null,
    address: clinic?.address ?? null,
    workingHoursStart: profile?.working_hours_start ?? "09:00",
    workingHoursEnd: profile?.working_hours_end ?? "18:00",
  };
}

function formatPersonalProfile(profile) {
  return {
    fullName: profile?.full_name ?? "",
    specialization: profile?.specialization ?? "",
    email: profile?.email ?? "",
    phone: profile?.phone ?? null,
    licenseNumber: profile?.license_number ?? "",
    avatarUrl: profile?.avatar_url ?? null,
    joinedAt: profile?.created_at ?? null,
  };
}

function formatNotificationSettings(profile) {
  return {
    remindersEnabled: profile?.reminders_enabled !== false,
  };
}

function formatPreferences(profile) {
  const language = profile?.default_scribe_language ?? DEFAULT_SCRIBE_LANGUAGE;
  return {
    defaultScribeLanguage: VALID_SCRIBE_LANGUAGES.has(language)
      ? language
      : DEFAULT_SCRIBE_LANGUAGE,
  };
}

function parseRemindersEnabled(rawValue) {
  if (typeof rawValue !== "boolean") {
    throw new DoctorProfileRequestError("remindersEnabled must be a boolean");
  }
  return rawValue;
}

function parseDefaultScribeLanguage(rawValue) {
  const language = String(rawValue ?? "").trim().toLowerCase();
  if (!VALID_SCRIBE_LANGUAGES.has(language)) {
    throw new DoctorProfileRequestError(
      `Default Scribe language must be one of: ${[...VALID_SCRIBE_LANGUAGES].join(", ")}`,
    );
  }
  return language;
}

function parseFullName(rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) {
    throw new DoctorProfileRequestError("Full name is required");
  }
  return name;
}

function parseSpecialization(rawSpecialization) {
  const specialization = String(rawSpecialization ?? "").trim();
  if (!specialization) {
    throw new DoctorProfileRequestError("Specialization is required");
  }
  return specialization;
}

function parseEmail(rawEmail) {
  const email = String(rawEmail ?? "").trim();
  if (!email) {
    throw new DoctorProfileRequestError("Email is required");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DoctorProfileRequestError("Enter a valid email address");
  }
  return email;
}

function parseLicenseNumber(rawLicense) {
  const license = String(rawLicense ?? "").trim();
  return license || null;
}

export class DoctorProfileService {
  /**
   * @param {import("../booking/repository/doctor-profile.repository.js").DoctorProfileRepository} doctorProfileRepository
   * @param {*} clinicRepository
   * @param {import("@supabase/supabase-js").SupabaseClient|null} [storageClient]
   *   Service-role client used for Storage uploads. Optional for fee/profile
   *   tests that never touch photo upload.
   */
  constructor(doctorProfileRepository, clinicRepository, storageClient = null) {
    this._doctors = doctorProfileRepository;
    this._clinics = clinicRepository;
    this._storage = storageClient;
    this._log = createLogger({ component: "DoctorProfileService" });
  }

  async _requireProfile(clinicId, userId) {
    const profile = await this._doctors.findByUserId(clinicId, userId);
    if (!profile) {
      throw new DoctorProfileRequestError("Doctor profile not found", 404);
    }
    return profile;
  }

  async _requireClinic(clinicId) {
    const clinic = await this._clinics.findById(clinicId);
    if (!clinic) {
      throw new DoctorProfileRequestError("Clinic not found", 404);
    }
    return clinic;
  }

  async getSettings(clinicId, userId) {
    const [profile, clinic] = await Promise.all([
      this._requireProfile(clinicId, userId),
      this._requireClinic(clinicId),
    ]);

    return {
      consultationFee: normalizeStoredFee(profile.consultation_fee),
      clinic: formatClinicSettings(clinic, profile),
      profile: formatPersonalProfile(profile),
      notifications: formatNotificationSettings(profile),
      preferences: formatPreferences(profile),
    };
  }

  async getConsultationFee(clinicId, userId) {
    const settings = await this.getSettings(clinicId, userId);
    return { consultationFee: settings.consultationFee };
  }

  async updateConsultationFee(clinicId, userId, rawFee) {
    const fee = parseFeeInput(rawFee);
    await this._requireProfile(clinicId, userId);

    const updated = await this._doctors.updateConsultationFee(clinicId, userId, fee);
    return { consultationFee: normalizeStoredFee(updated.consultation_fee) };
  }

  async updateClinicSettings(clinicId, userId, input) {
    await this._requireProfile(clinicId, userId);

    const name = parseClinicName(input.name);
    const phone = parseClinicPhone(input.phone);
    const address = parseClinicAddress(input.address);
    const workingHours = parseWorkingHours(
      input.workingHoursStart,
      input.workingHoursEnd,
    );

    const [updatedClinic] = await Promise.all([
      this._clinics.updateById(clinicId, { name, phone, address }),
      this._doctors.updateClinicSettings(clinicId, userId, {
        clinic_name: name,
        clinic_address: address,
        working_hours_start: workingHours.start,
        working_hours_end: workingHours.end,
      }),
    ]);

    return {
      clinic: formatClinicSettings(updatedClinic, {
        working_hours_start: workingHours.start,
        working_hours_end: workingHours.end,
      }),
    };
  }

  async updatePersonalProfile(clinicId, userId, input) {
    await this._requireProfile(clinicId, userId);

    const updated = await this._doctors.updatePersonalProfile(clinicId, userId, {
      full_name: parseFullName(input.fullName),
      specialization: parseSpecialization(input.specialization),
      email: parseEmail(input.email),
      phone: parseIndianMobilePhone(input.phone, "Phone"),
      license_number: parseLicenseNumber(input.licenseNumber),
    });

    return { profile: formatPersonalProfile(updated) };
  }

  async updateNotificationSettings(clinicId, userId, input) {
    await this._requireProfile(clinicId, userId);

    const remindersEnabled = parseRemindersEnabled(input.remindersEnabled);
    const updated = await this._doctors.updateRemindersEnabled(
      clinicId,
      userId,
      remindersEnabled,
    );

    return { notifications: formatNotificationSettings(updated) };
  }

  async updatePreferences(clinicId, userId, input) {
    await this._requireProfile(clinicId, userId);

    const defaultScribeLanguage = parseDefaultScribeLanguage(input.defaultScribeLanguage);
    const updated = await this._doctors.updateDefaultScribeLanguage(
      clinicId,
      userId,
      defaultScribeLanguage,
    );

    return { preferences: formatPreferences(updated) };
  }

  /**
   * Uploads a profile photo to the public `profile-photos` bucket and persists
   * the public URL on doctor_profiles.avatar_url.
   *
   * @param {string} clinicId
   * @param {string} userId
   * @param {{ bytes: Uint8Array|ArrayBuffer|Buffer; mimeType: string; size: number }} file
   */
  async updateProfilePhoto(clinicId, userId, file) {
    await this._requireProfile(clinicId, userId);

    if (!this._storage?.storage) {
      throw new DoctorProfileRequestError(
        "Photo storage is not configured",
        500,
      );
    }

    const mimeType = String(file?.mimeType ?? "").toLowerCase();
    if (!PROFILE_PHOTO.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new DoctorProfileRequestError(
        "Photo must be a JPG, PNG, or WebP image",
      );
    }

    const size = Number(file?.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new DoctorProfileRequestError("Photo file is empty");
    }
    if (size > PROFILE_PHOTO.MAX_BYTES) {
      throw new DoctorProfileRequestError("Photo must be 2MB or smaller");
    }

    const extension = MIME_TO_EXTENSION[mimeType];
    const storagePath = PROFILE_PHOTO.buildPath(clinicId, userId, extension);
    const body =
      file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);

    const { error: uploadError } = await this._storage.storage
      .from(PROFILE_PHOTO.BUCKET)
      .upload(storagePath, body, {
        contentType: mimeType,
        upsert: true,
        cacheControl: "3600",
      });

    if (uploadError) {
      this._log.error("Failed to upload profile photo", {
        clinicId,
        userId,
        storagePath,
        error: uploadError.message,
      });
      throw new DoctorProfileRequestError(
        "Failed to upload profile photo. Please try again.",
        500,
      );
    }

    const { data: publicData } = this._storage.storage
      .from(PROFILE_PHOTO.BUCKET)
      .getPublicUrl(storagePath);

    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) {
      throw new DoctorProfileRequestError(
        "Failed to resolve profile photo URL",
        500,
      );
    }

    // Bust CDN/browser cache after upsert to the same object path.
    const avatarUrl = `${publicUrl}?v=${Date.now()}`;
    const updated = await this._doctors.updateAvatarUrl(
      clinicId,
      userId,
      avatarUrl,
    );

    return { profile: formatPersonalProfile(updated) };
  }
}
