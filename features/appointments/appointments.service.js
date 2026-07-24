import {
  APPOINTMENT_STATUS,
  SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES,
  SLOT_TIMEZONE_OFFSET,
} from "../booking/constants.js";
import {
  formatAppointmentStatusLabel,
  formatRefundStatusLabel,
  resolveAppointmentSlotDateRange,
} from "../booking/lib/appointment-list.js";
import { formatPaymentStatusLabel } from "../booking/lib/payment-list.js";
import { formatSlotLabel } from "../booking/lib/slot-engine.js";
import { PatientsService } from "../patients/patients.service.js";

const CLINIC_TIME_ZONE = "Asia/Kolkata";
const CLINIC_OFFSET_MS = 330 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AppointmentRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "AppointmentRequestError";
    this.statusCode = statusCode;
  }
}

function localDayStartMs(date, dayOffset = 0) {
  const shifted = new Date(date.getTime() + CLINIC_OFFSET_MS);
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + dayOffset,
  ) - CLINIC_OFFSET_MS;
}

function localDateKey(value) {
  return new Date(new Date(value).getTime() + CLINIC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function parseClinicSlot(date, time) {
  if (!DATE_PATTERN.test(date ?? "") || !TIME_PATTERN.test(time ?? "")) {
    throw new AppointmentRequestError("A valid date and time are required");
  }
  const slot = new Date(`${date}T${time}:00${SLOT_TIMEZONE_OFFSET}`);
  if (Number.isNaN(slot.getTime())) {
    throw new AppointmentRequestError("A valid date and time are required");
  }
  return slot;
}

function relatedPatientName(appointment) {
  const patient = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients;
  return patient?.full_name ?? "Unknown patient";
}

function formatAppointment(appointment) {
  const slotStart = new Date(appointment.slot_start);
  const slotEnd = new Date(appointment.slot_end);
  return {
    id: appointment.id,
    patient_id: appointment.patient_id,
    patient_name: relatedPatientName(appointment),
    contact_phone: appointment.contact_phone ?? null,
    date: localDateKey(slotStart),
    time: new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: CLINIC_TIME_ZONE,
    }).format(slotStart),
    slot_start: appointment.slot_start,
    slot_end: appointment.slot_end,
    duration: Math.max(
      1,
      Math.round((slotEnd.getTime() - slotStart.getTime()) / 60_000),
    ),
    type: null,
    status: appointment.status,
    payment_status: appointment.payment_status,
    payment_amount: appointment.payment_amount ?? null,
    refund_status: appointment.refund_status ?? null,
    refund_id: appointment.refund_id ?? null,
    refunded_at: appointment.refunded_at ?? null,
    created_at: appointment.created_at ?? null,
  };
}

export class AppointmentsService {
  constructor(appointmentRepository, patientRepository, doctorProfileRepository) {
    this._appointments = appointmentRepository;
    this._patients = patientRepository;
    this._doctors = doctorProfileRepository;
    this._patientDirectory = new PatientsService(
      patientRepository,
      appointmentRepository,
    );
  }

  async list(clinicId, scope = "all", now = new Date()) {
    const todayStart = new Date(localDayStartMs(now));
    const tomorrowStart = new Date(localDayStartMs(now, 1));
    const filtersByScope = {
      today: {
        fromIso: todayStart.toISOString(),
        toIso: tomorrowStart.toISOString(),
        ascending: true,
      },
      upcoming: {
        fromIso: tomorrowStart.toISOString(),
        ascending: true,
      },
      past: {
        toIso: todayStart.toISOString(),
        ascending: false,
      },
      all: { ascending: false },
    };
    const filters = filtersByScope[scope];
    if (!filters) {
      throw new AppointmentRequestError("Invalid appointment filter");
    }

    const rows = await this._appointments.findForClinic(clinicId, filters);
    return rows.map(formatAppointment);
  }

  /**
   * Paginated dashboard list (payments-page pattern). Filters on slot_start.
   *
   * @param {string} clinicId
   * @param {{
   *   search?: string|null;
   *   status?: string|null;
   *   range?: string|null;
   *   from?: string|null;
   *   to?: string|null;
   *   limit?: number;
   *   offset?: number;
   * }} [filters]
   */
  async listPaginated(clinicId, {
    search = null,
    status = null,
    range = "all",
    from = null,
    to = null,
    limit = 20,
    offset = 0,
  } = {}) {
    const { fromIso, toIso } = resolveAppointmentSlotDateRange(range, { from, to });
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const { rows, total } = await this._appointments.listForClinicDashboard(clinicId, {
      search,
      status,
      fromIso,
      toIso,
      limit: safeLimit,
      offset: safeOffset,
    });

    const appointments = rows.map((row) => {
      const slotStart = row.slot_start ? new Date(row.slot_start) : null;
      return {
        id: row.id,
        patientId: row.patient_id,
        patientName: row.patient_name,
        contactPhone: row.contact_phone,
        slotStart: row.slot_start,
        slotEnd: row.slot_end,
        slotLabel: slotStart && !Number.isNaN(slotStart.getTime())
          ? formatSlotLabel(slotStart)
          : null,
        status: row.status,
        statusLabel: formatAppointmentStatusLabel(row.status),
        paymentStatus: row.payment_status,
        paymentStatusLabel:
          !row.payment_status || row.payment_status === "not_required"
            ? "—"
            : formatPaymentStatusLabel(row.payment_status),
        amount: row.payment_amount,
        refundStatus: row.refund_status,
        refundStatusLabel: formatRefundStatusLabel(row.refund_status),
        refundId: row.refund_id,
        refundedAt: row.refunded_at,
        createdAt: row.created_at,
      };
    });

    return {
      appointments,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + appointments.length < total,
    };
  }

  async listPatientOptions(clinicId) {
    return this._patientDirectory.listOptions(clinicId);
  }

  async getById(clinicId, appointmentId) {
    const appointment = await this._appointments.findByIdForClinic(
      clinicId,
      appointmentId,
    );
    if (!appointment) {
      throw new AppointmentRequestError("Appointment not found", 404);
    }

    const patient = appointment.patient_id
      ? await this._patients.findById(clinicId, appointment.patient_id)
      : null;

    return {
      ...formatAppointment({
        ...appointment,
        patients: patient ? { full_name: patient.full_name } : null,
      }),
      patient_age: patient?.age_years ?? null,
      patient_gender: patient?.gender ?? null,
    };
  }

  async create(clinicId, input) {
    if (!input.patientId) {
      throw new AppointmentRequestError("patientId is required");
    }
    const patient = await this._patients.findById(clinicId, input.patientId);
    if (!patient) {
      throw new AppointmentRequestError("Patient not found", 404);
    }
    if (!patient.contact_phone) {
      throw new AppointmentRequestError(
        "This patient has no contact number and cannot be booked",
      );
    }

    const doctor = await this._doctors.findPrimaryByClinicId(clinicId);
    if (!doctor) {
      throw new AppointmentRequestError("No doctor is configured for this clinic", 409);
    }

    const slotStart = parseClinicSlot(input.date, input.time);
    if (slotStart <= new Date()) {
      throw new AppointmentRequestError("Appointment time must be in the future");
    }
    const durationMinutes =
      doctor.consultation_duration || SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES;
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
    const result = await this._appointments.createIfAvailable({
      clinic_id: clinicId,
      doctor_id: doctor.id,
      patient_id: patient.id,
      contact_phone: patient.contact_phone,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      status: APPOINTMENT_STATUS.CONFIRMED,
      wa_message_id: null,
      payment_status: "not_required",
    });

    if (result.conflict) {
      throw new AppointmentRequestError(
        result.conflict === "SLOT_TAKEN"
          ? "That appointment slot is already taken"
          : "The appointment could not be created",
        409,
      );
    }
    return result.row;
  }

  async cancel(clinicId, appointmentId) {
    const cancelled = await this._appointments.cancelFromDashboard(
      clinicId,
      appointmentId,
    );
    if (!cancelled) {
      throw new AppointmentRequestError(
        "Appointment cannot be cancelled in its current state",
        409,
      );
    }
    return cancelled;
  }

  async reschedule(clinicId, appointmentId, input) {
    const current = await this._appointments.findByIdForClinic(
      clinicId,
      appointmentId,
    );
    if (!current) {
      throw new AppointmentRequestError("Appointment not found", 404);
    }

    const slotStart = parseClinicSlot(input.date, input.time);
    if (slotStart <= new Date()) {
      throw new AppointmentRequestError("Appointment time must be in the future");
    }
    const currentDuration = Math.max(
      1,
      Math.round(
        (Date.parse(current.slot_end) - Date.parse(current.slot_start)) / 60_000,
      ),
    );
    const slotEnd = new Date(slotStart.getTime() + currentDuration * 60_000);
    const result = await this._appointments.rescheduleFromDashboard(
      clinicId,
      appointmentId,
      slotStart.toISOString(),
      slotEnd.toISOString(),
    );

    if (result.conflict) {
      throw new AppointmentRequestError("That appointment slot is already taken", 409);
    }
    if (!result.row) {
      throw new AppointmentRequestError(
        "Appointment cannot be updated in its current state",
        409,
      );
    }
    return result.row;
  }
}

