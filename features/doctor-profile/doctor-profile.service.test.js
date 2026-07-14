import test from "node:test";
import assert from "node:assert/strict";
import {
  DoctorProfileRequestError,
  DoctorProfileService,
} from "./doctor-profile.service.js";

function createService({ profile = { id: "doctor-1", consultation_fee: 500 }, updateResult } = {}) {
  const calls = { findByUserId: [], updateConsultationFee: [] };
  const doctorProfileRepository = {
    async findByUserId(clinicId, userId) {
      calls.findByUserId.push({ clinicId, userId });
      return profile;
    },
    async updateConsultationFee(clinicId, userId, consultationFee) {
      calls.updateConsultationFee.push({ clinicId, userId, consultationFee });
      return updateResult ?? { consultation_fee: consultationFee };
    },
  };

  return {
    calls,
    service: new DoctorProfileService(doctorProfileRepository),
  };
}

test("getConsultationFee returns the doctor's current fee", async () => {
  const { service, calls } = createService();

  const result = await service.getConsultationFee("clinic-1", "user-1");

  assert.deepEqual(calls.findByUserId, [{ clinicId: "clinic-1", userId: "user-1" }]);
  assert.equal(result.consultationFee, 500);
});

test("getConsultationFee returns null when consultation_fee is unset", async () => {
  const { service } = createService({ profile: { id: "doctor-1", consultation_fee: null } });

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
