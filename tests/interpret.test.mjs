import assert from "node:assert/strict";
import test from "node:test";
import { findTest } from "../js/catalog.js";
import { ageYears, interpret } from "../js/interpret.js";
import { matchTest } from "../js/match.js";
import { validateBackup } from "../js/backup.js";

function at(id, extra = {}) {
  return interpret(findTest(id), {
    numeric: null,
    comparator: "",
    qualitative: "",
    refLow: null,
    refHigh: null,
    date: "2026-03-13",
    specimen: "",
    ...extra,
  }, extra.profile || {});
}

test("HbA1c tiers and report ranges", () => {
  const normal = at("hba1c", { numeric: 5.4 });
  assert.equal(normal.tier, "Normal");
  assert.equal(normal.level, "normal");
  const pre = at("hba1c", { numeric: 6 });
  assert.equal(pre.tier, "Prediabetes range");
  assert.equal(pre.level, "high");
  assert.match(pre.guidance, /not a diagnosis/i);
  const screen = at("hba1c", { numeric: 6.4 });
  assert.equal(screen.tier, "Type 2 diabetes screening range");
  const insideReport = at("hba1c", { numeric: 6, refLow: 4, refHigh: 7 });
  assert.equal(insideReport.level, "normal");
  assert.equal(insideReport.source, "report");
  assert.equal(insideReport.tier, "Prediabetes range");
});

test("LDL uses the printed cut-off unless a CV-risk category is chosen", () => {
  assert.equal(at("ldl", { numeric: 3.1 }).level, "high");
  assert.equal(at("ldl", { numeric: 2.4 }).level, "normal");
  const highRisk = at("ldl", { numeric: 2.4, profile: { cvRisk: "high" } });
  assert.equal(highRisk.level, "high");
  assert.match(highRisk.rangeLabel, /1\.8/);
  const reportWins = at("ldl", { numeric: 2.4, refHigh: 3.4, highInclusive: false, profile: { cvRisk: "high" } });
  assert.equal(reportWins.level, "normal");
  assert.equal(reportWins.source, "report");
});

test("ratios, AIP, hsCRP, EBV, H. pylori, eGFR, and PSA", () => {
  const male = at("tc-hdl", { numeric: 5.2, profile: { sex: "male" } });
  assert.equal(male.level, "high");
  const female = at("tc-hdl", { numeric: 4.2, profile: { sex: "female" } });
  assert.equal(female.level, "normal");
  assert.equal(at("aip", { numeric: 0.05 }).tier, "Low");
  assert.equal(at("aip", { numeric: 0.2 }).tier, "Intermediate");
  assert.equal(at("aip", { numeric: 0.3 }).tier, "High");
  assert.equal(at("hscrp", { numeric: 0.6 }).tier, "Low");
  assert.equal(at("hscrp", { numeric: 12 }).tier, "Above 10");
  assert.equal(at("ebv", { numeric: 11.4 }).tier, "Equivocal");
  assert.equal(at("ebv", { numeric: 13 }).level, "high");
  assert.equal(at("hpylori", { numeric: 1.2 }).tier, "Positive");
  assert.match(at("hpylori", { numeric: 1.2 }).guidance, /urea breath test/i);
  assert.equal(at("egfr", { numeric: 96 }).tier, "G1");
  assert.equal(at("egfr", { numeric: 70 }).tier, "G2");
  assert.equal(at("egfr", { numeric: 50 }).level, "high");
  const psa = at("psa", { numeric: 3.2, profile: { sex: "male", dob: "1970-01-01" } });
  assert.equal(ageYears("1970-01-01", "2026-03-13"), 56);
  assert.equal(psa.level, "normal");
  assert.match(psa.rangeLabel, /50–59/);
  assert.equal(at("psa", { numeric: 4, profile: { sex: "male", dob: "1970-01-01" } }).level, "high");
});

test("immunity is not flagged and infection screens are", () => {
  const hepa = at("hepa-igg", { qualitative: "Detected" });
  assert.equal(hepa.level, "normal");
  assert.match(hepa.title, /vaccination|exposure/i);
  const antibody = at("hbsab", { numeric: 86 });
  assert.equal(antibody.level, "normal");
  assert.match(antibody.title, /protective/i);
  const lowAb = at("hbsab", { numeric: 4 });
  assert.equal(lowAb.level, "info");
  const antigen = at("hbsag", { qualitative: "Detected" });
  assert.equal(antigen.level, "high");
  assert.equal(at("hbsag", { qualitative: "Not detected" }).level, "normal");
  assert.equal(at("rpr", { qualitative: "Non reactive" }).level, "normal");
  assert.equal(at("rpr", { qualitative: "Reactive" }).level, "high");
  assert.equal(at("hiv", { qualitative: "Not detected" }).level, "normal");
});

test("censored numbers and urine notes", () => {
  assert.equal(at("rf", { numeric: 20, comparator: "<" }).level, "normal");
  assert.equal(at("urine-protein", { qualitative: "Negative" }).level, "normal");
  assert.equal(at("urine-protein", { qualitative: "Positive" }).level, "high");
  assert.equal(at("urine-colour", { qualitative: "Pale yellow" }).level, "normal");
  assert.equal(at("hepa-igg", { qualitative: "Detected" }).seekCare, false);
});

test("aliases include Chinese names and abbreviations", () => {
  assert.equal(matchTest("红血素").id, "hb");
  assert.equal(matchTest("HbA1c").id, "hba1c");
  assert.equal(matchTest("LDL Cholesterol").id, "ldl");
  assert.equal(matchTest("White Cell Count").id, "wbc");
  assert.equal(matchTest("血小板").id, "plt");
  assert.equal(matchTest("Hep A IgG").id, "hepa-igg");
});

test("version 1 backups become results with catalog ids", () => {
  const imported = validateBackup({
    app: "HealthLog",
    version: 1,
    data: {
      labs: [{
        id: "lab-1",
        testName: "Haemoglobin",
        value: 141,
        unit: "g/L",
        refLow: 130,
        refHigh: 170,
        date: "2026-01-02",
        lab: "Fictional",
        notes: "fake",
      }],
      bp: [{ id: "bp-1", systolic: 118, diastolic: 76, date: "2026-01-02T08:00" }],
    },
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.data.results[0].testId, "hb");
  assert.equal(imported.data.results[0].numeric, 141);
  assert.equal(imported.data.reports.length, 1);
  assert.equal(imported.data.bp[0].systolic, 118);
});
