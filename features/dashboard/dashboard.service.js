const CLINIC_TIME_ZONE = "Asia/Kolkata";
const CLINIC_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function patientName(appointment) {
  const relation = Array.isArray(appointment.patients)
    ? appointment.patients[0]
    : appointment.patients;
  return relation?.full_name ?? "Unknown patient";
}

/**
 * Read model for the authenticated dashboard. It intentionally composes the
 * existing clinic-scoped booking repositories and scribe session service;
 * no database queries live in the page or client hook.
 */
export class DashboardService {
  constructor(patientRepository, appointmentRepository, sessionService) {
    this._patients = patientRepository;
    this._appointments = appointmentRepository;
    this._sessions = sessionService;
  }

  async getDashboardData(ctx, now = new Date()) {
    const todayStartMs = localDayStartMs(now);
    const tomorrowStartMs = localDayStartMs(now, 1);
    const sevenDayStartMs = localDayStartMs(now, -6);

    const shiftedNow = new Date(now.getTime() + CLINIC_OFFSET_MS);
    const daysSinceMonday = (shiftedNow.getUTCDay() + 6) % 7;
    const currentWeekStartMs = localDayStartMs(now, -daysSinceMonday);

    const [patientSummary, appointments, completedSessions] = await Promise.all([
      this._patients.getDashboardSummary(ctx.clinicId, 4),
      this._appointments.findDashboardActivity(
        ctx.clinicId,
        new Date(sevenDayStartMs).toISOString(),
        new Date(tomorrowStartMs).toISOString(),
      ),
      this._sessions.listSessions(
        {
          status: "COMPLETED",
          date_from: new Date(currentWeekStartMs).toISOString(),
          date_to: now.toISOString(),
          page: 1,
          limit: 1,
        },
        ctx,
      ),
    ]);

    const todayKey = localDateKey(todayStartMs);
    const todayAppointments = appointments
      .filter((appointment) => localDateKey(appointment.slot_start) === todayKey)
      .map((appointment) => ({
        id: appointment.id,
        patientName: patientName(appointment),
        slotStart: appointment.slot_start,
        time: new Intl.DateTimeFormat("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: CLINIC_TIME_ZONE,
        }).format(new Date(appointment.slot_start)),
        type: null,
        status: appointment.status,
      }));

    const countsByDate = new Map();
    for (const appointment of appointments) {
      const key = localDateKey(appointment.slot_start);
      countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
    }

    const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
      const dayMs = sevenDayStartMs + index * DAY_MS;
      const date = new Date(dayMs);
      const key = localDateKey(date);
      return {
        date: key,
        label: new Intl.DateTimeFormat("en-IN", {
          weekday: "short",
          timeZone: CLINIC_TIME_ZONE,
        }).format(date),
        count: countsByDate.get(key) ?? 0,
        isToday: key === todayKey,
      };
    });

    return {
      stats: {
        totalPatients: patientSummary.total,
        todayAppointments: todayAppointments.length,
        completedScribeSessionsThisWeek: completedSessions.total,
        // The live patients table has no status column. Existing repositories
        // define current patients as non-deleted, so that is the only honest
        // active-patient definition available today.
        activePatients: patientSummary.total,
      },
      todayAppointments,
      recentPatients: patientSummary.recent.map((patient) => ({
        id: patient.id,
        name: patient.full_name,
        lastActivityAt: patient.updated_at,
        status: "active",
      })),
      weeklyActivity,
      metadata: {
        activePatientDefinition: "non_deleted",
        appointmentTypeAvailable: false,
      },
    };
  }
}

