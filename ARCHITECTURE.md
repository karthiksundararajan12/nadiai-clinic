# Nadi AI — Architecture
**Scope:** WhatsApp Booking Bot (P0). Other modules (scribe, prescription, RPM) documented separately when built.
**Last updated:** 2026-07-03
**Status:** clinics + doctor_profiles exist in Supabase. patients, appointments, conversation_state are new — not yet created in DB.

---

## 1. Core Principle

`appointments` is the hub table. Every module (booking, reminders, and — later — scribe/prescription/RPM) traces through it. `clinic_id` is denormalized onto every table that needs tenant scoping, so no query ever has to join through multiple tables just to enforce tenant isolation.

---

## 2. Entity Relationship Diagram (text form)

```
auth.users (Supabase managed)
     │
     │ 1:1
     ▼
doctor_profiles ──────────────┐
     │ clinic_id (FK)         │
     ▼                        │
  clinics                     │
     │                        │
     │ clinic_id (FK)         │ doctor_id (FK)
     ▼                        ▼
  patients ──────────────► appointments ◄────── conversation_state
     │ patient_id (FK)         │ clinic_id (FK)         (clinic_id + contact_phone,
     └─────────────────────────┘                         not tied to patient_id)
                               │
                               │ rescheduled_from_id (self-FK)
                               ▼
                          appointments (prior record)
```

**Key relationships:**
- `doctor_profiles.user_id` → `auth.users.id` (1:1, cascade delete)
- `doctor_profiles.clinic_id` → `clinics.id` (nullable — doctor can exist before clinic setup completes)
- `patients.clinic_id` → `clinics.id`
- `appointments.clinic_id` → `clinics.id` (denormalized — also derivable via doctor_id or patient_id, but kept direct for query speed and tenant-isolation safety)
- `appointments.doctor_id` → `doctor_profiles.id`
- `appointments.patient_id` → `patients.id`
- `appointments.rescheduled_from_id` → `appointments.id` (self-reference, nullable)
- `conversation_state.clinic_id` → `clinics.id` (scoped by contact_phone, NOT patient_id — one contact can be mid-flow before a patient record even exists)

---

## 3. Tables

### `clinics` (exists)
Tenant root. Holds WhatsApp Business Account setup state (Meta Embedded Signup fields) and Interakt integration fields.

Key columns: `id`, `name`, `whatsapp_phone_number_id`, `whatsapp_business_account_id`, `whatsapp_setup_status`, `address`, `phone`.

### `doctor_profiles` (exists)
One doctor per clinic (v1 assumption — multi-doctor clinics out of scope for now). Linked to Supabase auth.

Key columns: `id`, `user_id` (→ auth.users), `clinic_id` (→ clinics), `whatsapp_phone_number_id`, `working_hours_start`/`end`, `consultation_duration`, `consultation_fee`.

**⚠️ Resolved:** `whatsapp_phone_number_id` exists on both `clinics` and `doctor_profiles`. **`clinics.whatsapp_phone_number_id` is the source of truth for all webhook routing.** The column on `doctor_profiles` is legacy — do not read from it in any new handler. Recommend dropping it in a future migration once confirmed nothing else references it; for now, leave it alone but treat it as dead.

### `patients` (new)
Distinct from `contact_phone` to support pediatric multi-patient-per-contact (parent booking for multiple children from one WhatsApp number).

Key columns: `id`, `clinic_id`, `contact_phone`, `full_name`, `date_of_birth`/`age_years`, `relationship_to_contact`, `consent_given`/`consent_given_at` (DPDP compliance — captured at first data collection point), `deleted_at` (soft delete).

### `appointments` (new) — the hub
Every state in the booking bot's state machine maps to a value in `status`.

Key columns: `id`, `clinic_id`, `doctor_id`, `patient_id`, `contact_phone` (denormalized for fast webhook lookup without a join), `slot_start`/`slot_end`, `status`, `wa_message_id` (idempotency), `razorpay_payment_id` (idempotency), `payment_status`, `payment_amount`, `hold_expires_at` (migration 019 — see below), `rescheduled_from_id` (self-FK), `cancelled_at`/`cancellation_reason`, `deleted_at` (soft delete — never hard-deleted).

**Constraints of note:**
- Unique on `wa_message_id` and `razorpay_payment_id` — protects against webhook retry duplication.
- Partial unique index on `(doctor_id, slot_start)` where status not in `('cancelled','rescheduled')` — prevents double-booking at the database level, not just application logic.
- `hold_expires_at` (nullable, `status = 'payment_pending'` only): when a PAYMENT_PENDING slot hold expires. Since a partial-index predicate must be IMMUTABLE in Postgres, expiry against `now()` can't live in the unique index above — it's enforced by the booking bot instead: availability reads filter out expired holds, and an idempotent release runs immediately before every booking write. No background job. See `features/booking/repository/appointment.repository.js`.

**Payment amount:** `payment_amount` is the doctor's real `doctor_profiles.consultation_fee` at the moment a PAYMENT_PENDING Razorpay Payment Link is created (`SlotSelectionService`, via `features/booking/lib/consultation-fee.js`) — not a placeholder. A doctor with `consultation_fee` left unset (null) is a configuration error: booking hands off to HUMAN_HANDOFF rather than silently charging (or not charging) a made-up amount. An explicit fee of `0` is a valid, deliberate "free consultation" and skips payment entirely.

### `razorpay_webhook_events` (new, migration 020)
Idempotency ledger for the Razorpay webhook (`/api/webhooks/razorpay`), keyed on the `X-Razorpay-Event-Id` header (`event_id`, unique). Insert-if-new is the dedupe mechanism: a unique violation means "already processed" and the handler no-ops instead of re-running a transition. See `features/booking/services/payment-webhook.service.js`.

### `conversation_state` (new)
Tracks where a WhatsApp contact is in the booking flow. Scoped by `(clinic_id, contact_phone)` — one active flow per contact per clinic.

Key columns: `id`, `clinic_id`, `contact_phone`, `current_state`, `context` (jsonb — holds in-progress selections like chosen patient_id or slot before the appointment row is created), `retry_count` (drives HUMAN_HANDOFF fallback), `last_message_at` (drives 24h inactivity expiry).

---

## 4. State Machine → Table Mapping

| Bot state | Primary table touched | Notes |
|---|---|---|
| START | `conversation_state` | create/reset row |
| COLLECTING_PATIENT | `patients`, `conversation_state` | consent captured here |
| SLOT_SELECTION | `appointments` (read availability), `conversation_state` | no appointment row created until slot confirmed |
| PAYMENT_PENDING | `appointments` (status update), Razorpay webhook | idempotent on `razorpay_webhook_events.event_id` (event-level) and `razorpay_payment_id` (row-level) |
| CONFIRMED | `appointments` | |
| REMINDER_SENT | `appointments` (read, scheduled job) | no new row, status/notification only |
| CANCELLED | `appointments` | soft — status change, cancelled_at set |
| RESCHEDULE_REQUESTED | `appointments` (new row, rescheduled_from_id set) | old row marked `rescheduled`, not cancelled |

---

## 5. Multi-Tenancy Rule

Every query in every handler must filter by `clinic_id`. No exceptions. Webhook entry point resolves `phone_number_id` → `clinics.id` once, at the top of the request, and that `clinic_id` is threaded through every subsequent query in that request.

## 6. Idempotency Rule

Any handler triggered by an external webhook (Meta WhatsApp, Razorpay) must check for existing `wa_message_id` / `razorpay_payment_id` before creating or mutating state. Webhooks can and will fire more than once for the same event.

## 7. Soft Delete Rule

No hard deletes on `patients` or `appointments`. Every delete is a `deleted_at` timestamp set. This supports audit trail and DPDP compliance requirements.

---

## 8. Open Decisions (resolve before/during build)

1. Availability rules beyond `working_hours_start/end` — no per-day-of-week or holiday config exists yet. Needed before SLOT_SELECTION can be fully correct.
2. Doctor-facing notification on new booking — not yet designed (WhatsApp message to doctor? dashboard?).
