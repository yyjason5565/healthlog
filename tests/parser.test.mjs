import assert from "node:assert/strict";
import test from "node:test";
import { parseLabReport, parseLine, parseRange } from "../js/parser.js";

const REPORT = `
NORTHSHORE SAMPLE LABORATORY
FICTIONAL REPORT — NOT A REAL PATIENT
Patient: Demo Person          Collected: 12 Mar 2026
Doctor: Dr Example           Reported: 13 Mar 2026
Test                  Result  Unit      Reference     Flag
Haemoglobin             138     g/L     130 - 170
White Cell Count        7.2     x10^9/L 4.0 - 11.0
Platelet Count          250     x10^9/L 150 - 400
HbA1c                   6.2     %       < 5.7        H
Fasting Glucose         5.4     mmol/L  4.0 - 5.6
Total Cholesterol       6.1     mmol/L  < 5.2        H
HDL Cholesterol         1.1     mmol/L  > 1.0
LDL Cholesterol         3.8     mmol/L  < 3.4        H
Triglycerides           1.9     mmol/L  < 1.7        H
Creatinine              78      umol/L  60 - 110
ALT                     32      U/L     < 41
TSH                     2.40    mIU/L   0.40 - 4.00
`;

test("parses a fictional printed report into rows with ranges", () => {
  const parsed = parseLabReport(REPORT);
  assert.equal(parsed.suggestedDate, "2026-03-13");
  assert.match(parsed.suggestedLab, /LABORATORY/i);
  const byName = Object.fromEntries(parsed.rows.map((row) => [row.testName, row]));
  assert.equal(byName.Haemoglobin.value, 138);
  assert.equal(byName.Haemoglobin.unit, "g/L");
  assert.equal(byName.Haemoglobin.refLow, 130);
  assert.equal(byName.Haemoglobin.refHigh, 170);
  assert.equal(byName["White Cell Count"].unit, "x10^9/L");
  assert.equal(byName["White Cell Count"].refLow, 4);
  assert.equal(byName["White Cell Count"].refHigh, 11);
  assert.equal(byName.HbA1c.value, 6.2);
  assert.equal(byName.HbA1c.unit, "%");
  assert.equal(byName.HbA1c.refHigh, 5.7);
  assert.equal(byName.HbA1c.highInclusive, false);
  assert.equal(byName.HbA1c.flag, "H");
  assert.equal(byName["HDL Cholesterol"].refLow, 1);
  assert.equal(byName["HDL Cholesterol"].lowInclusive, false);
  assert.equal(byName["LDL Cholesterol"].value, 3.8);
  assert.equal(byName["LDL Cholesterol"].refHigh, 3.4);
  assert.equal(byName.Creatinine.unit, "umol/L");
  assert.equal(byName.TSH.value, 2.4);
  assert.equal(byName.TSH.refLow, 0.4);
  assert.equal(byName.TSH.refHigh, 4);
  assert.equal(parsed.rows.length, 12);
});

test("parses one-sided ranges and comma decimals", () => {
  const low = parseRange("> 1.0");
  assert.equal(low.refLow, 1);
  assert.equal(low.lowInclusive, false);
  const high = parseRange("<= 5.2");
  assert.equal(high.refHigh, 5.2);
  assert.equal(high.highInclusive, true);
  const row = parseLine("Fasting Glucose 5,4 mmol/L 4,0 - 5,6");
  assert.equal(row.value, 5.4);
  assert.equal(row.refLow, 4);
  assert.equal(row.refHigh, 5.6);
});

test("repairs common OCR mistakes in HbA1c and x10^9 units", () => {
  const ocr = [
    "Haemoglobin         138 g/L     130 - 170",
    "White Cell Count      7.2 x1079/L 4.0 - 11.0",
    "Platelet Count       250 x1079/L  150 - 400",
    "HbAlc                6.2 %        < 5.7        H",
  ].join("\n");
  const parsed = parseLabReport(ocr);
  const byName = Object.fromEntries(parsed.rows.map((row) => [row.testName, row]));
  assert.equal(byName.Haemoglobin.value, 138);
  assert.equal(byName["White Cell Count"].unit, "x10^9/L");
  assert.equal(byName["White Cell Count"].value, 7.2);
  assert.equal(byName["Platelet Count"].refHigh, 400);
  assert.equal(byName.HbA1c.value, 6.2);
  assert.equal(byName.HbA1c.flag, "H");
});

test("joins a wrapped name onto the next result line and skips headers", () => {
  const parsed = parseLabReport("Haemoglobin\n138 g/L 130 - 170\nReference range\nPage 1 of 2\n");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].testName, "Haemoglobin");
  assert.equal(parsed.rows[0].value, 138);
});
