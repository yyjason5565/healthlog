import { newId } from "./db.js";
import { addDays } from "./format.js";

function lab(partial) {
  return {
    id: newId(),
    testName: partial.testName,
    value: partial.value,
    unit: partial.unit,
    refLow: partial.refLow ?? null,
    refHigh: partial.refHigh ?? null,
    lowInclusive: partial.lowInclusive !== false,
    highInclusive: partial.highInclusive !== false,
    refText: partial.refText || "",
    flag: partial.flag || "",
    date: partial.date,
    lab: "Fictional Sample Lab",
    notes: "Fictional demo data — not a real person.",
    sample: true,
  };
}

export function buildSample(now = new Date()) {
  const day = (n) => addDays(n, now);
  return {
    labs: [
      lab({ testName: "Haemoglobin (SAMPLE)", value: 136, unit: "g/L", refLow: 120, refHigh: 170, refText: "120 - 170", date: day(-200) }),
      lab({ testName: "Haemoglobin (SAMPLE)", value: 140, unit: "g/L", refLow: 120, refHigh: 170, refText: "120 - 170", date: day(-20) }),
      lab({ testName: "LDL cholesterol (SAMPLE)", value: 3.1, unit: "mmol/L", refHigh: 3.4, highInclusive: false, refText: "< 3.4", date: day(-200) }),
      lab({ testName: "LDL cholesterol (SAMPLE)", value: 3.6, unit: "mmol/L", refHigh: 3.4, highInclusive: false, refText: "< 3.4", flag: "H", date: day(-40) }),
      lab({ testName: "LDL cholesterol (SAMPLE)", value: 3.9, unit: "mmol/L", refHigh: 3.4, highInclusive: false, refText: "< 3.4", flag: "H", date: day(-18) }),
      lab({ testName: "HbA1c (SAMPLE)", value: 5.2, unit: "%", refHigh: 5.7, highInclusive: false, refText: "< 5.7", date: day(-200) }),
      lab({ testName: "HbA1c (SAMPLE)", value: 5.4, unit: "%", refHigh: 5.7, highInclusive: false, refText: "< 5.7", date: day(-18) }),
    ],
    bp: [
      { id: newId(), systolic: 116, diastolic: 74, pulse: 68, date: `${day(-70)}T08:10`, notes: "Fictional demo reading.", sample: true },
      { id: newId(), systolic: 122, diastolic: 78, pulse: 70, date: `${day(-28)}T08:05`, notes: "Fictional demo reading.", sample: true },
      { id: newId(), systolic: 128, diastolic: 82, pulse: 72, date: `${day(-2)}T08:00`, notes: "Fictional demo reading.", sample: true },
    ],
    weights: [
      { id: newId(), kg: 66.4, heightCm: 165, date: `${day(-80)}T07:40`, notes: "Fictional demo weight.", sample: true },
      { id: newId(), kg: 65.5, heightCm: 165, date: `${day(-30)}T07:40`, notes: "Fictional demo weight.", sample: true },
      { id: newId(), kg: 64.8, heightCm: 165, date: `${day(-3)}T07:45`, notes: "Fictional demo weight.", sample: true },
    ],
    glucose: [
      { id: newId(), mmol: 5.1, context: "fasting", date: `${day(-21)}T07:30`, notes: "Fictional demo glucose.", sample: true },
      { id: newId(), mmol: 5.3, context: "fasting", date: `${day(-10)}T07:30`, notes: "Fictional demo glucose.", sample: true },
      { id: newId(), mmol: 5.4, context: "fasting", date: `${day(-1)}T07:25`, notes: "Fictional demo glucose.", sample: true },
    ],
    meds: [
      {
        id: newId(),
        name: "Sample vitamin tablet (not a real medicine)",
        dose: "1 tablet",
        frequency: "Once daily",
        start: day(-100),
        end: "",
        notes: "Fictional demo medication. Not a prescription.",
        sample: true,
      },
    ],
    visits: [
      {
        id: newId(),
        date: day(-18),
        doctor: "Dr Example (fictional)",
        reason: "Demo check-up",
        notes: "Fake visit for trying HealthLog. Not a real appointment.",
        followUp: day(21),
        sample: true,
      },
    ],
  };
}
