import test from "node:test";
import assert from "node:assert/strict";
import {
  DoctorProfileRequestError,
  DoctorProfileService,
} from "./doctor-profile.service.js";

const DEFAULT_CLINIC = {
  id: "clinic-1",
  name: "Deepti clinic",
  phone: "919840227132",
  address: "12 MG Road",
};

const DEFAULT_PROFILE = {
  id: "doctor-1",
  full_name: "Dr. Ananya Mehta",
  specialization: "Cardiologist",
  email: "dr.ananya@nadiai.com",
  phone: "919876543210",
  license_number: "MCI-123456",
  created_at: "2026-01-15T10:00:00.000Z",
  reminders_enabled: true,
  default_scribe_language: "hinglish",
  consultation_fee: 500,
  working_hours_start: "09:00",
  working_hours_end: "18:00",
};

function createService({
  profile = DEFAULT_PROFILE,
  clinic = DEFAULT_CLINIC,
  updateConsultationFeeResult,
  updateClinicResult,
  updatePersonalProfileResult,
  updateRemindersEnabledResult,
  updateDefaultScribeLanguageResult,
} = {}) {
  const calls = {
    findByUserId: [],
    findById: [],
    updateConsultationFee: [],
    updateClinicSettings: [],
    updatePersonalProfile: [],
    updateRemindersEnabled: [],
    updateDefaultScribeLanguage: [],
    updateById: [],
  };

  const doctorProfileRepository = {
    async findByUserId(clinicId, userId) {
      calls.findByUserId.push({ clinicId, userId });
      return profile;
    },
    async updateConsultationFee(clinicId, userId, consultationFee) {
      calls.updateConsultationFee.push({ clinicId, userId, consultationFee });
      return updateConsultationFeeResult ?? { consultation_fee: consultationFee };
    },
    async updateClinicSettings(clinicId, userId, data) {
      calls.updateClinicSettings.push({ clinicId, userId, data });
      return {
        working_hours_start: data.working_hours_start,
        working_hours_end: data.working_hours_end,
      };
    },
    async updatePersonalProfile(clinicId, userId, data) {
      calls.updatePersonalProfile.push({ clinicId, userId, data });
      return (
        updatePersonalProfileResult ?? {
          full_name: data.full_name,
          specialization: data.specialization,
          email: data.email,
          phone: data.phone,
          license_number: data.license_number,
          created_at: DEFAULT_PROFILE.created_at,
        }
      );
    },
    async updateRemindersEnabled(clinicId, userId, remindersEnabled) {
      calls.updateRemindersEnabled.push({ clinicId, userId, remindersEnabled });
      return updateRemindersEnabledResult ?? { reminders_enabled: remindersEnabled };
    },
    async updateDefaultScribeLanguage(clinicId, userId, defaultScribeLanguage) {
      calls.updateDefaultScribeLanguage.push({ clinicId, userId, defaultScribeLanguage });
      return (
        updateDefaultScribeLanguageResult ?? {
          default_scribe_language: defaultScribeLanguage,
        }
      );
    },
  };

  const clinicRepository = {
    async findById(clinicId) {
      calls.findById.push(clinicId);
      return clinic;
    },
    async updateById(clinicId, data) {
      calls.updateById.push({ clinicId, data });
      return updateClinicResult ?? { ...DEFAULT_CLINIC, ...data };
    },
  };

  return {
    calls,
    service: new DoctorProfileService(doctorProfileRepository, clinicRepository),
  };
}

test("getSettings returns consultation fee, clinic fields, personal profile, notifications, and preferences", async () => {
  const { service, calls } = createService();

  const result = await service.getSettings("clinic-1", "user-1");

  assert.deepEqual(calls.findByUserId, [{ clinicId: "clinic-1", userId: "user-1" }]);
  assert.deepEqual(calls.findById, ["clinic-1"]);
  assert.equal(result.consultationFee, 500);
  assert.deepEqual(result.clinic, {
    name: "Deepti clinic",
    phone: "919840227132",
    address: "12 MG Road",
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
  });
  assert.deepEqual(result.profile, {
    fullName: "Dr. Ananya Mehta",
    specialization: "Cardiologist",
    email: "dr.ananya@nadiai.com",
    phone: "919876543210",
    licenseNumber: "MCI-123456",
    joinedAt: "2026-01-15T10:00:00.000Z",
  });
  assert.deepEqual(result.notifications, { remindersEnabled: true });
  assert.deepEqual(result.preferences, { defaultScribeLanguage: "hinglish" });
});

test("getConsultationFee returns the doctor's current fee", async () => {
  const { service } = createService();

  const result = await service.getConsultationFee("clinic-1", "user-1");

  assert.equal(result.consultationFee, 500);
});

test("getConsultationFee returns null when consultation_fee is unset", async () => {
  const { service } = createService({
    profile: { ...DEFAULT_PROFILE, consultation_fee: null },
  });

  const result = await service.getConsultationFee("clinic-1", "user-1");

  assert.equal(result.consultationFee, null);
});

test("updateConsultationFee writes a validated whole-rupee fee", async () => {
  const { service, calls } = createService();

  const result = await service.updateConsultationFee("clinic-1", "user-1", 750);

  assert.deepEqual(calls.updateConsultationFee, [
    { clinicId: "clinic-1", userId: "user-1", consultationFee: 750 },
  ]);
  assert.equal(result.consultationFee, 750);
});

test("updateConsultationFee rejects fees outside the allowed range", async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.updateConsultationFee("clinic-1", "user-1", 100_001),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /whole number/.test(error.message),
  );
});

test("updateConsultationFee rejects missing profiles", async () => {
  const { service } = createService({ profile: null });

  await assert.rejects(
    () => service.updateConsultationFee("clinic-1", "user-1", 500),
    (error) =>
      error instanceof DoctorProfileRequestError && error.statusCode === 404,
  );
});

test("updateClinicSettings writes clinics and doctor_profiles from the same payload", async () => {
  const { service, calls } = createService();

  const result = await service.updateClinicSettings("clinic-1", "user-1", {
    name: "Nadi Heart Care",
    phone: "+91 9840227132",
    address: "42 Brigade Road",
    workingHoursStart: "10:00",
    workingHoursEnd: "17:00",
  });

  assert.deepEqual(calls.updateById, [
    {
      clinicId: "clinic-1",
      data: {
        name: "Nadi Heart Care",
        phone: "919840227132",
        address: "42 Brigade Road",
      },
    },
  ]);
  assert.deepEqual(calls.updateClinicSettings, [
    {
      clinicId: "clinic-1",
      userId: "user-1",
      data: {
        clinic_name: "Nadi Heart Care",
        clinic_address: "42 Brigade Road",
        working_hours_start: "10:00",
        working_hours_end: "17:00",
      },
    },
  ]);
  assert.equal(result.clinic.name, "Nadi Heart Care");
  assert.equal(result.clinic.workingHoursStart, "10:00");
});

test("updateClinicSettings rejects empty clinic names", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updateClinicSettings("clinic-1", "user-1", {
        name: "   ",
        phone: "9840227132",
        address: "",
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /Clinic name/.test(error.message),
  );
});

test("updateClinicSettings rejects invalid Indian phone numbers", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updateClinicSettings("clinic-1", "user-1", {
        name: "Deepti clinic",
        phone: "12345",
        address: "",
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /Indian mobile/.test(error.message),
  );
});

test("updateClinicSettings rejects working hours where close is not after open", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updateClinicSettings("clinic-1", "user-1", {
        name: "Deepti clinic",
        phone: "9840227132",
        address: "",
        workingHoursStart: "18:00",
        workingHoursEnd: "09:00",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /Closing time/.test(error.message),
  );
});

test("updatePersonalProfile writes validated doctor_profiles fields", async () => {
  const { service, calls } = createService();

  const result = await service.updatePersonalProfile("clinic-1", "user-1", {
    fullName: "Dr. Nadi Heart",
    specialization: "Interventional Cardiology",
    email: "nadi@example.com",
    phone: "+91 9840227132",
    licenseNumber: "MCI-999",
  });

  assert.deepEqual(calls.updatePersonalProfile, [
    {
      clinicId: "clinic-1",
      userId: "user-1",
      data: {
        full_name: "Dr. Nadi Heart",
        specialization: "Interventional Cardiology",
        email: "nadi@example.com",
        phone: "919840227132",
        license_number: "MCI-999",
      },
    },
  ]);
  assert.equal(result.profile.fullName, "Dr. Nadi Heart");
  assert.equal(result.profile.phone, "919840227132");
});

test("updatePersonalProfile rejects empty full names", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updatePersonalProfile("clinic-1", "user-1", {
        fullName: "   ",
        specialization: "Cardiologist",
        email: "nadi@example.com",
        phone: "9840227132",
        licenseNumber: "",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /Full name/.test(error.message),
  );
});

test("updatePersonalProfile rejects invalid email addresses", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updatePersonalProfile("clinic-1", "user-1", {
        fullName: "Dr. Nadi Heart",
        specialization: "Cardiologist",
        email: "not-an-email",
        phone: "9840227132",
        licenseNumber: "",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /valid email/.test(error.message),
  );
});

test("updatePersonalProfile clears license number when blank", async () => {
  const { service, calls } = createService();

  await service.updatePersonalProfile("clinic-1", "user-1", {
    fullName: "Dr. Nadi Heart",
    specialization: "Cardiologist",
    email: "nadi@example.com",
    phone: "9840227132",
    licenseNumber: "   ",
  });

  assert.equal(calls.updatePersonalProfile[0].data.license_number, null);
});

test("updateNotificationSettings writes reminders_enabled", async () => {
  const { service, calls } = createService();

  const result = await service.updateNotificationSettings("clinic-1", "user-1", {
    remindersEnabled: false,
  });

  assert.deepEqual(calls.updateRemindersEnabled, [
    { clinicId: "clinic-1", userId: "user-1", remindersEnabled: false },
  ]);
  assert.deepEqual(result.notifications, { remindersEnabled: false });
});

test("updateNotificationSettings rejects non-boolean remindersEnabled", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updateNotificationSettings("clinic-1", "user-1", {
        remindersEnabled: "false",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /boolean/.test(error.message),
  );
});

test("updatePreferences writes default_scribe_language", async () => {
  const { service, calls } = createService();

  const result = await service.updatePreferences("clinic-1", "user-1", {
    defaultScribeLanguage: "hindi",
  });

  assert.deepEqual(calls.updateDefaultScribeLanguage, [
    { clinicId: "clinic-1", userId: "user-1", defaultScribeLanguage: "hindi" },
  ]);
  assert.deepEqual(result.preferences, { defaultScribeLanguage: "hindi" });
});

test("updatePreferences rejects invalid default Scribe languages", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.updatePreferences("clinic-1", "user-1", {
        defaultScribeLanguage: "french",
      }),
    (error) =>
      error instanceof DoctorProfileRequestError &&
      error.statusCode === 400 &&
      /Default Scribe language/.test(error.message),
  );
});
