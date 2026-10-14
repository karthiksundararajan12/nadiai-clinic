import test from "node:test";
import assert from "node:assert/strict";
import { parseVisitVitalsInput, VisitVitalsService } from "./visit-vitals.service.js";

test("visit vitals save accepts out-of-range readings the UI will flag", () => {
  const parsed = parseVisitVitalsInput({
    bp_systolic: 300,
    bp_diastolic: 20,
    pulse: 20,
    temp: 89,
    temp_unit: "F",
    spo2: 40,
    weight: 0.2,
    height: "",
  });
  assert.equal(parsed.bp_systolic, 300);
  assert.equal(parsed.temp, 89);
  assert.equal(parsed.weight, 0.2);
});

test("visit vitals upsert stays on the clinic patient", async () => {
  const rows = [];
  const service = new VisitVitalsService(
    {
      async findForVisit() {
        return null;
      },
      async insert(row) {
        rows.push(row);
        return { id: "v1", ...row, weight_kg: row.weight_kg, height_cm: row.height_cm };
      },
      async update() {
        throw new Error("unexpected update");
      },
    },
    {
      async findById(clinicId, patientId) {
        return clinicId === "clinic-1" && patientId === "patient-1" ? { id: "patient-1" } : null;
      },
    },
    {
      async findByIdForClinic() {
        return null;
      },
    },
  );

  const saved = await service.save("clinic-1", {
    patientId: "patient-1",
    bp_systolic: 120,
    bp_diastolic: 80,
    pulse: 78,
  });
  assert.equal(saved.vitals.bp_systolic, 120);
  assert.equal(rows[0].clinic_id, "clinic-1");
  assert.equal(rows[0].patient_id, "patient-1");

  await assert.rejects(
    () => service.save("clinic-2", { patientId: "patient-1", pulse: 70 }),
    /Patient not found/,
  );
});
