import assert from "node:assert/strict";
import test from "node:test";
import { buildBackup, toCsv, validateBackup } from "../js/backup.js";

test("rejects a file that is not a HealthLog backup", () => {
  const result = validateBackup({ hello: 1 });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /not a HealthLog backup/);
});

test("accepts a valid backup and keeps known fields only", () => {
  const backup = buildBackup({
    labs: [{
      id: "lab-1",
      testName: "HbA1c (SAMPLE)",
      value: 5.4,
      unit: "%",
      refHigh: 5.7,
      highInclusive: false,
      refText: "< 5.7",
      date: "2026-03-13",
      lab: "Fictional Sample Lab",
      notes: "Fictional",
      sample: true,
      extra: "ignore me",
    }],
    bp: [{ id: "bp-1", systolic: 120, diastolic: 80, pulse: 70, date: "2026-03-01T08:00", notes: "" }],
    glucose: [{ id: "g-1", mmol: 5.4, context: "fasting", date: "2026-03-02T07:30" }],
  }, { theme: "dark", glucoseUnit: "mg/dL", heightCm: 165 });
  const result = validateBackup(backup);
  assert.equal(result.ok, true);
  assert.equal(result.data.labs[0].testName, "HbA1c (SAMPLE)");
  assert.equal(result.data.labs[0].extra, undefined);
  assert.equal(result.data.bp[0].systolic, 120);
  assert.equal(result.data.glucose[0].context, "fasting");
  assert.equal(result.settings.glucoseUnit, "mg/dL");
  assert.equal(result.settings.theme, "dark");
  const csv = toCsv(result.data);
  assert.match(csv, /HbA1c \(SAMPLE\)/);
  assert.match(csv, /120\/80/);
});

test("rejects a lab row without a value", () => {
  const result = validateBackup({
    app: "HealthLog",
    version: 1,
    data: { labs: [{ id: "x", testName: "ALT", date: "2026-01-01" }] },
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /value/i);
});
