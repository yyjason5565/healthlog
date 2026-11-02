import assert from "node:assert/strict";
import test from "node:test";
import { validateBackup } from "../js/backup.js";

const EXPECTED = {
  Haemoglobin: "hb",
  RBC: "rbc",
  PCV: "pcv",
  MCV: "mcv",
  MCH: "mch",
  MCHC: "mchc",
  RDW: "rdw",
  "White cell count": "wbc",
  Neutrophils: "neut",
  Lymphocytes: "lymph",
  Monocytes: "mono",
  Eosinophils: "eos",
  Basophils: "baso",
  "N:L ratio": "nl-ratio",
  Platelets: "plt",
  MPV: "mpv",
  PDW: "pdw",
  ESR: "esr",
  "Total cholesterol": "tc",
  Triglyceride: "tg",
  "HDL-C": "hdl",
  "LDL-C": "ldl",
  "Non-HDL-C": "non-hdl",
  "TC/HDL ratio": "tc-hdl",
  "LDL/HDL ratio": "ldl-hdl",
  Sodium: "na",
  Potassium: "k",
  Chloride: "cl",
  Urea: "urea",
  Creatinine: "creatinine",
  "eGFR (CKD-EPI)": "egfr",
  "Uric acid": "uric",
  Calcium: "calcium",
  "Corrected calcium": "calcium-corr",
  Phosphate: "phosphate",
  "Total protein": "protein",
  Albumin: "albumin",
  Globulin: "globulin",
  "Albumin/Globulin ratio": "ag-ratio",
  ALP: "alp",
  "Total bilirubin": "bilirubin",
  GGT: "ggt",
  AST: "ast",
  ALT: "alt",
  "Fasting glucose": "glucose",
  HbA1c: "hba1c",
  hsCRP: "hscrp",
  TSH: "tsh",
  AFP: "afp",
  CEA: "cea",
  PSA: "psa",
  "EBV VCA IgA (NPC screen)": "ebv",
  "Hep B surface antibody": "hbsab",
  "H. pylori IgG": "hpylori",
  Testosterone: "testosterone",
  "Urine SG": "urine-sg",
  "Urine pH": "urine-ph",
  "Urine leucocytes (microscopy)": "urine-wbc-micro",
  "Urine erythrocytes (microscopy)": "urine-rbc-micro",
};

test("a version 1 panel with shared date and lab becomes one catalog report", () => {
  const names = Object.keys(EXPECTED);
  const imported = validateBackup({
    app: "HealthLog",
    version: 1,
    data: {
      labs: names.map((name, index) => ({
        id: `lab-${index + 1}`,
        testName: name,
        value: 1,
        unit: "",
        date: "2026-04-01",
        lab: "Fictional Import Lab",
        notes: "Fake import fixture. Not a real result.",
      })),
    },
  });
  assert.equal(imported.ok, true, (imported.errors || []).join("; "));
  assert.equal(imported.data.reports.length, 1);
  assert.equal(imported.data.reports[0].dateCollected, "2026-04-01");
  assert.equal(imported.data.reports[0].lab, "Fictional Import Lab");
  assert.equal(imported.data.customTests.length, 0);
  assert.equal(imported.data.results.length, names.length);
  const byName = Object.fromEntries(imported.data.results.map((row) => [row.name, row]));
  names.forEach((name) => {
    assert.equal(byName[name].testId, EXPECTED[name], name);
    assert.equal(byName[name].reportId, imported.data.reports[0].id);
    assert.equal(byName[name].numeric, 1);
  });
  assert.equal(byName["Fasting glucose"].specimen, "fasting");
});
