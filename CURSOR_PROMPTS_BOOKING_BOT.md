# Booking Bot — Cursor Build Prompts
**Companion to:** `WHATSAPP_BOOKING_BOT_REQUIREMENTS.md`, `ARCHITECTURE.md`, `.cursorrules`
**Usage:** Run these as separate Cursor sessions, in order. Each prompt assumes the previous state's handler already exists. Paste one block at a time — do not paste the whole file into one session.

---

## Session 0 — Setup Check (run once, before Session 1)

```
Before implementing any booking bot handlers, review ARCHITECTURE.md and 
confirm the following tables/columns exist and match the schema described 
there: clinic, doctor_profile, patient, appointment, conversation_state.

Confirm appointment has: clinic_id, doctor_id, patient_id, contact_phone, 
slot, status, wa_message_id, razorpay_payment_id (nullable), soft-delete 
column (e.g. deleted_at).

Confirm conversation_state is scoped by (contact_phone, phone_number_id) 
— not by patient_id.

If anything is missing or inconsistent, list the gaps before writing 
any handler code. Do not auto-fix schema — flag it back to me first.
```

---

## Session 1 — START state

```
Implement the START state handler for the WhatsApp booking bot.

Trigger: inbound message from a contact with no active conversation_state, 
or an expired one (expire after 24h inactivity).

Behavior:
- Route inbound webhook by phone_number_id → clinic_id (multi-tenant scoping — 
  every downstream query must be scoped by this clinic_id)
- Send greeting + intent menu: Book / Reschedule / Cancel / Talk to clinic 
  (use WhatsApp interactive buttons, not free text menu)
- On unrecognized input: re-prompt once, then transition to HUMAN_HANDOFF 
  and flag for manual clinic follow-up
- On "Book" selection: create/update conversation_state row, transition 
  to COLLECTING_PATIENT

Idempotency: dedupe on wa_message_id — if we've already processed this 
message_id, do not re-trigger side effects.

Do not implement COLLECTING_PATIENT logic yet — stub the transition only.
```

---

## Session 2 — COLLECTING_PATIENT state

```
Implement the COLLECTING_PATIENT state handler.

Behavior:
- Query existing patients linked to this contact_phone within this clinic_id
- If patients exist: present as a list ("Book for [Patient A] / [Patient B] / 
  Add new patient")
- If none exist, or "Add new patient" selected: prompt for patient name 
  and age/DOB
- Validate: name non-empty, age/DOB within plausible range (0–120 years)
- Fuzzy-match new patient name against existing patients for this contact 
  (Levenshtein or similar, threshold configurable) — if close match found, 
  confirm with user before creating a duplicate patient record
- Capture DPDP consent at this stage: log consent_given=true/timestamp on 
  the patient or contact record (this is the first data collection point 
  per requirements doc — do not assume WhatsApp opt-in counts as consent)
- On patient confirmed/selected: transition to SLOT_SELECTION

Edge case to handle explicitly: same contact starts a second booking flow 
for a different patient before finishing the first — do not let the second 
flow overwrite the first patient's in-progress conversation_state. Decide 
and implement: queue, reject with "finish current booking first", or 
support parallel sub-flows (recommend: reject with message, keep v1 simple).
```

---

## Session 3 — SLOT_SELECTION state

```
Implement the SLOT_SELECTION state handler.

Behavior:
- Query available slots for doctor_id within clinic_id, respecting the 
  clinic's configured availability rules
- Present as WhatsApp list/button reply (not free text)
- On selection: re-check slot is still available (handle race condition — 
  two contacts selecting the same slot near-simultaneously). Use a DB-level 
  constraint or transaction, not just an application-level check.
- If slot was taken in the meantime: re-fetch and re-show updated list, 
  do not fail silently
- Check if this patient already has a CONFIRMED appointment in an 
  overlapping window — if so, warn and require explicit confirmation 
  before proceeding
- On confirmed slot: check clinic's payment requirement flag
  - If prepayment required → transition to PAYMENT_PENDING, generate 
    Razorpay payment link
  - Else → transition directly to CONFIRMED

Do not implement PAYMENT_PENDING webhook logic yet — stub the transition 
and link generation only.
```

---

## Session 4 — PAYMENT_PENDING + CONFIRMED

```
Implement PAYMENT_PENDING and CONFIRMED state handlers.

PAYMENT_PENDING:
- Razorpay webhook handler for payment success/failure
- Idempotency: unique constraint on razorpay_payment_id — webhook may fire 
  more than once, must not double-process
- On payment success: transition appointment to CONFIRMED
- On no payment after configurable window (recommend 30 min): transition 
  to CANCELLED, release slot
- Edge case: payment succeeds after slot was independently cancelled or 
  taken by someone else — flag for manual refund (do not auto-refund in v1)

CONFIRMED:
- Send confirmation message: date, time, clinic address/location
- If clinic was cancelled/rescheduled by doctor (not by this flow) — bot 
  must proactively notify the contact, not just wait for inbound message
- Log appointment as CONFIRMED with timestamp

Do not implement reminder scheduling yet — that's a separate session.
```

---

## Session 5 — REMINDER_SENT

```
Implement the REMINDER_SENT state (system-triggered, not user-triggered).

Behavior:
- Scheduled job (cron or equivalent) checks CONFIRMED appointments and 
  sends reminders at T-24h and T-2h (configurable per clinic)
- IMPORTANT: WhatsApp requires pre-approved template messages for 
  business-initiated messages outside the 24h customer service window. 
  Confirm which reminder templates are approved before wiring this up — 
  do not assume free-form text works here.
- Reminder message includes quick-reply options: Confirm / Cancel / Reschedule
- On no response and appointment time passes: transition to COMPLETED 
  (default) or NO_SHOW if clinic has no-show tracking enabled (check 
  clinic config flag — this may be deferred per requirements doc open 
  questions)
- On Cancel/Reschedule reply: transition to CANCELLED or 
  RESCHEDULE_REQUESTED respectively
```

---

## Session 6 — CANCELLED / RESCHEDULE_REQUESTED

```
Implement CANCELLED and RESCHEDULE_REQUESTED handlers.

CANCELLED:
- Triggered from CONFIRMED, PAYMENT_PENDING, or REMINDER_SENT
- Soft delete only — set status=CANCELLED and cancelled_at timestamp, 
  never hard-delete the appointment row
- Release the slot for rebooking
- If payment was involved, check clinic's cancellation/refund policy 
  window — flag for manual refund if eligible (no auto-refund in v1)
- Send cancellation confirmation to contact

RESCHEDULE_REQUESTED:
- Keep reference to original appointment_id (for audit trail)
- Loop back into SLOT_SELECTION state with same patient context pre-filled
- On new slot confirmed: mark original appointment as RESCHEDULED 
  (not CANCELLED — distinct status), create new appointment row linked 
  to the original via a reference column
```

---

## Notes for every session

- Every query must be scoped by `clinic_id` — no exceptions, this is the multi-tenancy boundary.
- Every write that touches `wa_message_id` or `razorpay_payment_id` needs idempotency handling.
- No hard deletes anywhere in this flow.
- If Cursor's output diverges from ARCHITECTURE.md's FK structure, stop and flag — do not let it silently create new columns/tables.
