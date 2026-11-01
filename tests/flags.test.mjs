import assert from "node:assert/strict";
import test from "node:test";
import { assessBmi, assessBp, assessGlucose, assessLab, trendNote } from "../js/ranges.js";

function noDiagnosis(result) {
  const text = `${result.title} ${result.detail} ${result.guidance}`.toLowerCase();
  assert.match(result.guidance, /doctor/i);
  assert.doesNotMatch(text, /you have diabetes|you are diabetic|stop taking|change your dose|increase your dose/);
}

test("blood pressure categories and crisis threshold", () => {
  const normal = assessBp({ systolic: 118, diastolic: 76, pulse: 70 });
  assert.equal(normal.level, "normal");
  assert.equal(normal.seekCare, false);
  assert.equal(normal.source, "general");
  const stage1 = assessBp({ systolic: 128, diastolic: 82 });
  assert.equal(stage1.level, "high");
  assert.match(stage1.title, /stage 1/i);
  const crisis = assessBp({ systolic: 180, diastolic: 110 });
  assert.equal(crisis.level, "critical");
  assert.equal(crisis.seekCare, true);
  assert.match(crisis.title, /Seek medical care promptly/);
  const crisisDia = assessBp({ systolic: 150, diastolic: 120 });
  assert.equal(crisisDia.seekCare, true);
  noDiagnosis(crisis);
});

test("glucose thresholds use mmol/L and context", () => {
  const ok = assessGlucose({ mmol: 5.4, context: "fasting" });
  assert.equal(ok.level, "normal");
  assert.equal(ok.seekCare, false);
  const mild = assessGlucose({ mmol: 6.2, context: "fasting" });
  assert.equal(mild.level, "high");
  assert.equal(mild.seekCare, false);
  const low = assessGlucose({ mmol: 2.9, context: "random" });
  assert.equal(low.seekCare, true);
  assert.match(low.guidance, /under 3\.0/);
  const high = assessGlucose({ mmol: 15, context: "after" });
  assert.equal(high.seekCare, true);
  assert.match(high.title, /Seek medical care promptly/);
  noDiagnosis(mild);
});

test("report range wins, and general ranges are labelled", () => {
  const insideReport = assessLab({
    testName: "Fasting Glucose",
    value: 6,
    unit: "mmol/L",
    refLow: 4,
    refHigh: 7,
    lowInclusive: true,
    highInclusive: true,
  });
  assert.equal(insideReport.level, "normal");
  assert.equal(insideReport.source, "report");
  assert.match(insideReport.rangeLabel, /from your report/);

  const hba1c = assessLab({ testName: "HbA1c", value: 6.2, unit: "%" });
  assert.equal(hba1c.level, "high");
  assert.equal(hba1c.source, "general");
  assert.match(hba1c.rangeLabel, /general adult range/);
  noDiagnosis(hba1c);

  const hdl = assessLab({ testName: "HDL Cholesterol", value: 0.8, unit: "mmol/L" });
  assert.equal(hdl.level, "low");
  assert.equal(hdl.source, "general");
});

test("dangerous labs override a printed range", () => {
  const potassium = assessLab({
    testName: "Potassium",
    value: 6.8,
    unit: "mmol/L",
    refLow: 3.5,
    refHigh: 9,
  });
  assert.equal(potassium.seekCare, true);
  assert.match(potassium.guidance, /Seek medical care promptly/);
  assert.match(potassium.guidance, /do not/i);
});

test("BMI uses general adult bands", () => {
  const ok = assessBmi(64.8, 165);
  assert.equal(ok.level, "normal");
  assert.ok(ok.bmi > 23 && ok.bmi < 24);
  const high = assessBmi(90, 165);
  assert.equal(high.level, "high");
  assert.match(high.rangeLabel, /general adult/i);
});

test("trend note needs three meaningful steps", () => {
  assert.equal(trendNote([5.1, 5.3, 5.4]), "Rising over the last 3 results.");
  assert.equal(trendNote([66.4, 65.5, 64.8]), "Falling over the last 3 results.");
  assert.equal(trendNote([5, 5, 5.01]), "");
  assert.equal(trendNote([1, 2]), "");
});
