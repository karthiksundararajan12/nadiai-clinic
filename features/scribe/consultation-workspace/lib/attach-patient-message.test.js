import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const message = "Attach a patient to save this note";

test("the attach-patient message is shown once, next to Save", () => {
  const toolbar = readFileSync(join(root, "../components/ConsultationToolbar.jsx"), "utf8");
  const clinical = readFileSync(join(root, "../components/clinical/ConsultationClinicalLayout.jsx"), "utf8");
  assert.equal(toolbar.split(message).length - 1, 1);
  assert.equal(clinical.includes(message), false);
});
