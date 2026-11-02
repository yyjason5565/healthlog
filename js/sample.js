import { newId } from "./id.js";
import { addDays } from "./format.js";

function result(partial) {
  return {
    id: newId(),
    testId: partial.testId,
    name: `${partial.name} (SAMPLE)`,
    reportId: partial.reportId,
    date: partial.date,
    numeric: partial.numeric ?? null,
    comparator: partial.comparator || "",
    qualitative: partial.qualitative || "",
    unit: partial.unit || "",
    secondaryNumeric: partial.secondaryNumeric ?? null,
    secondaryUnit: partial.secondaryUnit || "",
    specimen: partial.specimen || "",
    refLow: partial.refLow ?? null,
    refHigh: partial.refHigh ?? null,
    lowInclusive: partial.lowInclusive !== false,
    highInclusive: partial.highInclusive !== false,
    refText: partial.refText || "",
    flag: partial.flag || "",
    notes: "Fictional demo — not a real person.",
    sample: true,
  };
}

export function buildSample(now = new Date()) {
  const day = (n) => addDays(n, now);
  const reportId = newId();
  const olderId = newId();
  const date = day(-18);
  const older = day(-200);
  const followDate = day(40);
  return {
    reports: [
      {
        id: olderId,
        dateCollected: older,
        patientName: "Demo Person (SAMPLE)",
        lab: "Fictional Sample Lab",
        labNumber: "GS-SAMPLE-000",
        doctor: "Dr Example (fictional)",
        fasting: true,
        notes: "Earlier fictional screening. Not a real report.",
        sample: true,
      },
      {
        id: reportId,
        dateCollected: date,
        patientName: "Demo Person (SAMPLE)",
        lab: "Fictional Sample Lab",
        labNumber: "GS-SAMPLE-001",
        doctor: "Dr Example (fictional)",
        fasting: true,
        notes: "Fictional GS15M-style panel. Not a real person.",
        sample: true,
      },
    ],
    results: [
      result({ testId: "hb", name: "Haemoglobin", reportId: olderId, date: older, numeric: 136, unit: "g/L", refLow: 130, refHigh: 170, refText: "130 - 170" }),
      result({ testId: "hb", name: "Haemoglobin", reportId, date, numeric: 142, unit: "g/L", refLow: 130, refHigh: 170, refText: "130 - 170" }),
      result({ testId: "wbc", name: "White cell count", reportId, date, numeric: 6.4, unit: "x10^9/L", refLow: 4, refHigh: 10, refText: "4.0 - 10.0" }),
      result({ testId: "neut", name: "Neutrophils", reportId, date, numeric: 3.5, unit: "x10^9/L", secondaryNumeric: 55, secondaryUnit: "%", refLow: 2, refHigh: 7 }),
      result({ testId: "plt", name: "Platelets", reportId, date, numeric: 240, unit: "x10^9/L", refLow: 150, refHigh: 410 }),
      result({ testId: "tc", name: "Total cholesterol", reportId, date, numeric: 5.4, unit: "mmol/L", refHigh: 5.2, highInclusive: false, refText: "<5.2" }),
      result({ testId: "hdl", name: "HDL-C", reportId, date, numeric: 1.2, unit: "mmol/L", refLow: 1, lowInclusive: false, refText: ">1.00" }),
      result({ testId: "ldl", name: "LDL-C", reportId, date, numeric: 3.1, unit: "mmol/L", refHigh: 2.6, highInclusive: false, refText: "<2.60" }),
      result({ testId: "ldl", name: "LDL-C", reportId: olderId, date: older, numeric: 2.8, unit: "mmol/L", refHigh: 2.6, highInclusive: false, refText: "<2.60" }),
      result({ testId: "glucose", name: "Glucose", reportId, date, numeric: 5.2, unit: "mmol/L", specimen: "fasting", refLow: 3.9, refHigh: 6, refText: "3.9 - 6.0" }),
      result({ testId: "hba1c", name: "HbA1c", reportId, date, numeric: 5.4, unit: "%", secondaryNumeric: 36, secondaryUnit: "mmol/mol", refHigh: 5.7, highInclusive: false, refText: "<5.7" }),
      result({ testId: "alt", name: "ALT", reportId, date, numeric: 28, unit: "U/L", refHigh: 51, highInclusive: false, refText: "<51" }),
      result({ testId: "egfr", name: "eGFR", reportId, date, numeric: 96, unit: "mL/min/1.73m2" }),
      result({ testId: "tsh", name: "TSH", reportId, date, numeric: 1.8, unit: "mIU/L", refLow: 0.4, refHigh: 4.7 }),
      result({ testId: "hbsag", name: "Hep B surface antigen", reportId, date, qualitative: "Not detected" }),
      result({ testId: "hbsab", name: "Hep B surface antibody", reportId, date, numeric: 86, unit: "IU/L" }),
      result({ testId: "hepa-igg", name: "Hep A IgG", reportId, date, qualitative: "Detected" }),
      result({ testId: "hpylori", name: "H. pylori IgG", reportId, date, numeric: 1.2, unit: "index" }),
      result({ testId: "urine-transparency", name: "Urine transparency", reportId, date, qualitative: "Clear" }),
      result({ testId: "urine-colour", name: "Urine colour", reportId, date, qualitative: "Pale yellow" }),
      result({ testId: "urine-protein", name: "Urine protein", reportId, date, qualitative: "Negative" }),
      result({ testId: "rf", name: "Rheumatoid factor", reportId, date, numeric: 20, comparator: "<", unit: "IU/mL", refHigh: 20, highInclusive: false, refText: "<20" }),
    ],
    followups: [
      {
        id: newId(),
        testId: "hpylori",
        resultId: "",
        reportId,
        action: "Fictional: ask about a urea breath test",
        date: followDate,
        notes: "Not a real appointment.",
        done: false,
        sample: true,
      },
    ],
    customTests: [],
    bp: [
      { id: newId(), systolic: 118, diastolic: 76, pulse: 68, date: `${day(-40)}T08:00`, notes: "Fictional demo reading.", sample: true },
      { id: newId(), systolic: 128, diastolic: 82, pulse: 72, date: `${day(-2)}T08:00`, notes: "Fictional demo reading.", sample: true },
    ],
    weights: [
      { id: newId(), kg: 70, heightCm: 170, date: `${day(-2)}T07:40`, notes: "Fictional demo weight.", sample: true },
    ],
    glucose: [
      { id: newId(), mmol: 5.3, context: "fasting", date: `${day(-1)}T07:20`, notes: "Fictional home glucose.", sample: true },
    ],
    meds: [
      {
        id: newId(),
        name: "Sample vitamin tablet (not a real medicine)",
        dose: "1 tablet",
        frequency: "Once daily",
        start: day(-100),
        end: "",
        notes: "Fictional demo. Not a prescription.",
        sample: true,
      },
    ],
    visits: [
      {
        id: newId(),
        date: day(-18),
        doctor: "Dr Example (fictional)",
        reason: "Demo screening review",
        notes: "Fake visit. Not a real appointment.",
        followUp: followDate,
        sample: true,
      },
    ],
  };
}
