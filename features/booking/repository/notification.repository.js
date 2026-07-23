/**
 * @fileoverview NotificationRepository — clinic-scoped in-app doctor
 * notifications (migration 025).
 */

import { BaseRepository } from "./base.repository.js";
import { DatabaseError } from "../errors.js";

/**
 * @typedef {{
 *   id: string;
 *   clinic_id: string;
 *   doctor_id: string|null;
 *   type: string;
 *   title: string;
 *   message: string;
 *   related_appointment_id: string|null;
 *   is_read: boolean;
 *   created_at: string;
 * }} ClinicNotification
 */

const SELECT_COLS =
  "id, clinic_id, doctor_id, type, title, message, related_appointment_id, is_read, created_at";

export class NotificationRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "notifications");
  }

  /**
   * @param {{
   *   clinicId: string;
   *   doctorId?: string|null;
   *   type: string;
   *   title: string;
   *   message: string;
   *   relatedAppointmentId?: string|null;
   * }} row
   * @returns {Promise<ClinicNotification>}
   */
  async insert({
    clinicId,
    doctorId = null,
    type,
    title,
    message,
    relatedAppointmentId = null,
  }) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            clinic_id: clinicId,
            doctor_id: doctorId,
            type,
            title,
            message,
            related_appointment_id: relatedAppointmentId,
          })
          .select(SELECT_COLS)
          .single(),
      "insert",
    );
  }

  /**
   * Newest notifications for a clinic (read + unread), capped for the bell panel.
   *
   * @param {string} clinicId
   * @param {{ limit?: number }} [opts]
   * @returns {Promise<ClinicNotification[]>}
   */
  async listRecentForClinic(clinicId, { limit = 20 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select(SELECT_COLS)
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: false })
          .limit(safeLimit),
      "listRecentForClinic",
    );
  }

  /**
   * @param {string} clinicId
   * @returns {Promise<number>}
   */
  async countUnreadForClinic(clinicId) {
    const { count, error } = await this._db
      .from(this._table)
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId)
      .eq("is_read", false);

    if (error) {
      this._log.error("DB error during countUnreadForClinic", {
        operation: "countUnreadForClinic",
        table: this._table,
        code: error.code,
      });
      throw new DatabaseError("countUnreadForClinic", error);
    }
    return count ?? 0;
  }

  /**
   * Marks one notification read, scoped by clinic (tenancy guard).
   *
   * @param {string} clinicId
   * @param {string} notificationId
   * @returns {Promise<ClinicNotification|null>}
   */
  async markRead(clinicId, notificationId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .update({ is_read: true })
          .eq("id", notificationId)
          .eq("clinic_id", clinicId)
          .select(SELECT_COLS)
          .single(),
      "markRead",
    );
  }

  /**
   * @param {string} clinicId
   * @returns {Promise<number>} Number of rows updated
   */
  async markAllRead(clinicId) {
    const { data, error } = await this._db
      .from(this._table)
      .update({ is_read: true })
      .eq("clinic_id", clinicId)
      .eq("is_read", false)
      .select("id");

    if (error) {
      this._log.error("DB error during markAllRead", {
        operation: "markAllRead",
        table: this._table,
        code: error.code,
      });
      throw new DatabaseError("markAllRead", error);
    }
    return data?.length ?? 0;
  }
}
