/**
 * @fileoverview Lists patients/appointments eligible for the Scribe
 * "start consultation" picker.
 */

import { formatPhoneForDisplay } from "../../booking/lib/phone.js";
import { formatSlotLabel } from "../../booking/lib/slot-engine.js";
import { filterEligibleConsultationAppointments } from "../lib/eligible-consultation-patients.js";

function relatedPatient(appointment) {
  const patient = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients;
  return patient ?? null;
}

function formatEligibleOption(appointment) {
  const patient = relatedPatient(appointment);
  const slotStart = appointment.slot_start ? new Date(appointment.slot_start) : null;
  return {
    appointmentId: appointment.id,
    patientId: appointment.patient_id,
    patientName: patient?.full_name ?? "Unknown patient",
    patientAge: patient?.age_years ?? null,
    patientGender: patient?.gender ?? null,
    patientPhone: appointment.contact_phone
      ? formatPhoneForDisplay(appointment.contact_phone)
      : null,
    slotStart: appointment.slot_start ?? null,
    slotLabel:
      slotStart && !Number.isNaN(slotStart.getTime())
        ? formatSlotLabel(slotStart)
        : null,
    status: appointment.status,
  };
}

export class EligibleConsultationService {
  /**
   * @param {import("../../booking/repository/appointment.repository.js").AppointmentRepository} appointmentRepository
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   */
  constructor(appointmentRepository, sessionRepository) {
    this._appointments = appointmentRepository;
    this._sessions = sessionRepository;
  }

  /**
   * CONFIRMED appointments for `clinicId` that do not already have a
   * COMPLETED scribe_sessions row for that appointment_id.
   *
   * @param {string} clinicId
   * @returns {Promise<ReturnType<typeof formatEligibleOption>[]>}
   */
  async listEligiblePatients(clinicId) {
    const appointments = await this._appointments.findConfirmedForClinic(clinicId);
    const appointmentIds = appointments.map((row) => row.id);
    const completedAppointmentIds = await this._sessions.findCompletedAppointmentIds(
      clinicId,
      appointmentIds,
    );

    const eligible = filterEligibleConsultationAppointments(
      appointments,
      completedAppointmentIds,
    );

    return eligible.map(formatEligibleOption);
  }
}
