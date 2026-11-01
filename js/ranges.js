import { canonicalUnit, formatBmi, normName, roundTo } from "./format.js";

export const DOCTOR = "This is general education, not a diagnosis, and not a reason to start, stop, or change any medicine or dose. Please discuss it with a doctor.";

const SEEK = "Seek medical care promptly. If you have severe symptoms, contact local emergency services (999 in Malaysia).";

const ALIASES = [
  ["hba1c", /hba1c|glycated haemoglobin|glycated hemoglobin|\ba1c\b/],
  ["glucose_fasting", /fasting (blood )?(glucose|sugar)|glucose fasting|fasting plasma glucose|\bfbs\b/],
  ["ldl", /\bldl\b/],
  ["hdl", /\bhdl\b/],
  ["trig", /triglycer/],
  ["chol", /total cholesterol|^cholesterol$/],
  ["glucose", /\bglucose\b|blood sugar/],
  ["hb", /haemoglobin|hemoglobin|^hb$|\bhgb\b/],
  ["wbc", /white cell|white blood|leukocyte|\bwbc\b|\bwcc\b|\btwbc\b/],
  ["plt", /platelet|thrombocyte|\bplt\b/],
  ["creatinine", /creatinine/],
  ["alt", /\balt\b|alanine aminotransferase|\bsgpt\b/],
  ["ast", /\bast\b|aspartate|\bsgot\b/],
  ["tsh", /\btsh\b|thyroid stimulating/],
  ["egfr", /\begfr\b|\bgfr\b/],
  ["k", /^k$|potassium/],
  ["na", /^na$|sodium/],
  ["urea", /\burea\b|\bbun\b/],
  ["vitd", /vitamin d|25 oh|25oh/],
];

const GENERAL = {
  hba1c: { unit: "%", low: 4, high: 5.7, highInclusive: false, about: "HbA1c estimates average blood glucose over about three months. A general adult screening figure often cited is under 5.7%. Conditions that change red blood cells can move the number." },
  glucose_fasting: { unit: "mmol/L", low: 3.9, high: 5.5, about: "Fasting glucose is the sugar in blood after not eating. A general adult fasting band often used is about 3.9–5.5 mmol/L." },
  glucose: { unit: "mmol/L", low: 3.9, high: 11.1, highInclusive: false, about: "Glucose is blood sugar. A random value of 11.1 mmol/L or more is a general screening threshold; when you last ate changes the meaning." },
  ldl: { unit: "mmol/L", high: 3.4, highInclusive: false, about: "LDL cholesterol is a form of blood fat that clinics watch because higher levels are linked with heart disease risk over years. Personal targets can be lower if you already have heart disease." },
  hdl: { unit: "mmol/L", low: 1, lowInclusive: false, about: "HDL cholesterol is a form that clinics often like to see higher. A general adult figure is above about 1.0 mmol/L." },
  trig: { unit: "mmol/L", high: 1.7, highInclusive: false, about: "Triglycerides are blood fats that can rise after a meal, with alcohol, or when glucose is high. A general fasting figure is under about 1.7 mmol/L." },
  chol: { unit: "mmol/L", high: 5.2, highInclusive: false, about: "Total cholesterol adds several kinds of blood fats. A general adult figure often used is under about 5.2 mmol/L. It is less specific than LDL and HDL together." },
  hb: { unit: "g/L", low: 120, high: 170, about: "Haemoglobin carries oxygen in red blood cells. General adult bands differ by sex; about 120–170 g/L is only a wide screen." },
  wbc: { unit: "x10^9/L", low: 4, high: 11, about: "White cells are part of how the body responds to infection and inflammation. A general adult count is often about 4–11 x10^9/L." },
  plt: { unit: "x10^9/L", low: 150, high: 400, about: "Platelets help blood clot. A general adult count is often about 150–400 x10^9/L." },
  creatinine: { unit: "umol/L", low: 45, high: 110, about: "Creatinine is a waste product cleared by the kidneys. A wide general adult band is about 45–110 µmol/L and it differs by sex and muscle." },
  alt: { unit: "U/L", high: 40, highInclusive: false, about: "ALT is an enzyme often used as a general look at the liver. Many labs flag results above about 40 U/L, and their own printed range should win when you have it." },
  ast: { unit: "U/L", high: 40, highInclusive: false, about: "AST is an enzyme found in liver, muscle, and other tissue. A single mild rise is something to show a doctor, not a verdict." },
  tsh: { unit: "mIU/L", low: 0.4, high: 4, about: "TSH is a pituitary signal that helps regulate the thyroid. A general adult band often cited is about 0.4–4.0 mIU/L." },
  egfr: { unit: "mL/min", low: 60, about: "eGFR is an estimate of kidney filtering. A general adult figure is about 60 mL/min or higher. The calculation depends on age and sex." },
  k: { unit: "mmol/L", low: 3.5, high: 5.2, about: "Potassium helps muscles and the heart rhythm. A general blood band is about 3.5–5.2 mmol/L." },
  na: { unit: "mmol/L", low: 135, high: 145, about: "Sodium is a blood salt that shifts with fluid balance. A general band is about 135–145 mmol/L." },
  urea: { unit: "mmol/L", low: 2.5, high: 7.8, about: "Urea is a waste product cleared by the kidneys and it also moves with hydration and protein intake." },
  vitd: { unit: "nmol/L", low: 50, high: 150, about: "Vitamin D is involved in bone and muscle health. A general blood band often cited is about 50–150 nmol/L." },
};

const ABOUT = {
  bp: "Blood pressure is the force of blood on artery walls, written as systolic over diastolic. One reading can be high from cuff size, talking, caffeine, pain, or stress.",
  glucose: "Blood glucose is the sugar measured in the blood at that moment. Meals, illness, steroids, and activity all move it.",
  bmi: "BMI is weight adjusted for height. It is only a rough screening measure and does not see muscle, frame, or health by itself.",
};

function matchAlias(name) {
  const n = normName(name);
  for (const [key, re] of ALIASES) {
    if (re.test(n)) return key;
  }
  return null;
}

export function seriesKey(name, unit) {
  return `${matchAlias(name) || normName(name)}|${canonicalUnit(unit)}`;
}

function compare(value, range) {
  if (value == null || !range) return "unknown";
  if (range.low != null) {
    const below = range.lowInclusive === false ? value <= range.low : value < range.low;
    if (below) return "low";
  }
  if (range.high != null) {
    const above = range.highInclusive === false ? value >= range.high : value > range.high;
    if (above) return "high";
  }
  if (range.low == null && range.high == null) return "unknown";
  return "normal";
}

function fmtBound(range, unit) {
  const u = unit ? ` ${unit}` : "";
  if (range.low == null && range.high == null) return "";
  if (range.low == null) {
    return `${range.highInclusive === false ? "<" : "≤"} ${trimNum(range.high)}${u}`;
  }
  if (range.high == null) {
    return `${range.lowInclusive === false ? ">" : "≥"} ${trimNum(range.low)}${u}`;
  }
  return `${trimNum(range.low)}–${trimNum(range.high)}${u}`;
}

function trimNum(value) {
  if (value == null) return "";
  const rounded = roundTo(Number(value), 2);
  return String(rounded);
}

function result(partial) {
  return {
    level: "unknown",
    title: "No range to compare",
    detail: "",
    guidance: "",
    seekCare: false,
    source: null,
    rangeLabel: "No reference range saved",
    band: null,
    ...partial,
  };
}

function withDoctor(text) {
  return `${text} ${DOCTOR}`;
}

const LEVEL_TITLE = {
  normal: "Within range",
  low: "Below range",
  high: "Above range",
  critical: "Seek medical care promptly",
  unknown: "No range to compare",
};

export function assessBp({ systolic, diastolic, pulse }) {
  const sys = Number(systolic);
  const dia = Number(diastolic);
  let level = "unknown";
  let title = "Blood pressure";
  let detail = ABOUT.bp;
  let seekCare = false;
  let guidance = "";

  if (Number.isFinite(sys) && Number.isFinite(dia)) {
    if (sys >= 180 || dia >= 120) {
      level = "critical";
      title = "Seek medical care promptly";
      seekCare = true;
      detail = "A reading at or above 180 systolic or 120 diastolic is a general hypertensive crisis range, especially with chest pain, breathlessness, weakness, trouble speaking, vision change, or a severe headache.";
      guidance = withDoctor(`${SEEK} ${detail}`);
    } else if (sys >= 140 || dia >= 90) {
      level = "high";
      title = "High, stage 2";
      detail = "Readings from 140/90 upward are a higher general adult category. A repeated pattern is worth a doctor visit soon.";
      guidance = withDoctor(`${detail} ${ABOUT.bp} People often discuss a repeat reading, home logs, sleep, salt, and movement with a clinician.`);
    } else if (sys >= 130 || dia >= 80) {
      level = "high";
      title = "High, stage 1";
      detail = "Readings from 130/80 upward are often grouped as high blood pressure in general adult categories.";
      guidance = withDoctor(`${detail} ${ABOUT.bp} Home readings help a clinician see the pattern.`);
    } else if (sys < 90 || dia < 60) {
      level = sys < 80 || dia < 45 ? "critical" : "low";
      seekCare = level === "critical";
      title = seekCare ? "Seek medical care promptly" : "Low for many adults";
      detail = "A reading under about 90/60 can be low for many adults. It matters more if you feel dizzy, faint, or unwell.";
      guidance = withDoctor(seekCare ? `${SEEK} ${detail}` : detail);
    } else if (sys >= 120 && dia < 80) {
      level = "high";
      title = "Elevated";
      detail = "Systolic pressure of 120–129 with diastolic under 80 is often called elevated in general adult categories.";
      guidance = withDoctor(`${detail} ${ABOUT.bp}`);
    } else {
      level = "normal";
      title = "Normal";
      detail = "Under 120/80 mmHg is often called a normal general adult range.";
      guidance = withDoctor(`${detail} ${ABOUT.bp}`);
    }
  }

  if (pulse != null && pulse !== "" && Number.isFinite(Number(pulse))) {
    const p = Number(pulse);
    if (p < 40 || p > 150) {
      level = "critical";
      seekCare = true;
      title = "Seek medical care promptly";
      const pulseNote = `The pulse is ${p} beats per minute, which is very low or very high for a resting adult.`;
      detail = pulseNote;
      guidance = withDoctor(`${SEEK} ${pulseNote}`);
    }
  }

  return result({
    level,
    title,
    detail,
    guidance,
    seekCare,
    source: "general",
    rangeLabel: "General adult categories (not a personal target)",
    band: null,
  });
}

export function assessGlucose({ mmol, context }) {
  const value = Number(mmol);
  if (!Number.isFinite(value)) {
    return result({ detail: ABOUT.glucose });
  }
  const where = {
    fasting: "fasting",
    before: "before a meal",
    after: "after a meal",
    random: "at a random time",
  }[context] || "at the time you logged";

  let level = "unknown";
  let title = "Blood sugar";
  let detail = "";
  let seekCare = false;
  let band = { low: 3.9, high: 7.8 };
  let rangeLabel = "General adult range (not from a lab report)";

  if (value < 3) {
    level = "critical";
    seekCare = true;
    title = "Seek medical care promptly";
    detail = "A glucose under 3.0 mmol/L is very low and can be dangerous, especially with sweating, shaking, confusion, or drowsiness.";
  } else if (value >= 15) {
    level = "critical";
    seekCare = true;
    title = "Seek medical care promptly";
    detail = "A glucose at or above 15 mmol/L is very high. Thirst, vomiting, deep breathing, abdominal pain, or confusion make this more urgent.";
  } else if (context === "after") {
    band = { low: 3.9, high: 7.8 };
    rangeLabel = "General figure often used about two hours after a meal: under 7.8 mmol/L";
    if (value < 3.9) {
      level = "low";
      title = "Below a general range";
      detail = `This after-meal reading is under 3.9 mmol/L. Timing and what you ate change the meaning.`;
    } else if (value < 7.8) {
      level = "normal";
      title = "Within a general after-meal range";
      detail = "Under about 7.8 mmol/L around two hours after eating is a general adult figure. Exact timing matters.";
    } else {
      level = "high";
      title = "Above a general after-meal range";
      detail = "This is at or above about 7.8 mmol/L, a general two-hour after-meal figure. It is not a diagnosis.";
    }
  } else if (context === "random") {
    band = { low: 3.9, high: 11.1 };
    rangeLabel = "General random screening band: 3.9 to under 11.1 mmol/L";
    if (value < 3.9) {
      level = "low";
      title = "Below a general range";
      detail = "Under 3.9 mmol/L is low for many adults whatever the clock says.";
    } else if (value < 11.1) {
      level = "normal";
      title = "Within a wide random range";
      detail = "Random glucose under 11.1 mmol/L sits below a general screening threshold. It can still be high for a fasting sample.";
    } else {
      level = "high";
      title = "Above a general random threshold";
      detail = "11.1 mmol/L or more on a random sample is a general screening threshold doctors look at with symptoms.";
    }
  } else {
    band = { low: 3.9, high: 5.5 };
    rangeLabel = context === "before"
      ? "General before-meal band, similar to fasting: 3.9–5.5 mmol/L"
      : "General fasting band: 3.9–5.5 mmol/L";
    if (value < 3.9) {
      level = "low";
      title = "Below a general fasting range";
      detail = "Under 3.9 mmol/L is below a general fasting band.";
    } else if (value <= 5.5) {
      level = "normal";
      title = "Within a general fasting range";
      detail = "About 3.9–5.5 mmol/L is a general adult fasting band.";
    } else if (value < 7) {
      level = "high";
      title = "Above a general fasting range";
      detail = "This is above about 5.5 mmol/L and under 7.0. Screening guidelines often call a fasting band like this prediabetes. Only a clinician can say what it means for you.";
    } else {
      level = "high";
      title = "In a general diabetes-screening range";
      detail = "A fasting value at or above 7.0 mmol/L is in a general diabetes-screening range. It is not a diagnosis by itself.";
    }
  }

  const guidance = withDoctor(seekCare ? `${SEEK} ${detail}` : `${detail} You logged this ${where}. ${ABOUT.glucose} People often discuss meals, sugary drinks, movement, sleep, and illness with a clinician.`);
  return result({
    level,
    title,
    detail,
    guidance,
    seekCare,
    source: "general",
    rangeLabel,
    band,
  });
}

export function assessBmi(kg, heightCm) {
  const weight = Number(kg);
  const height = Number(heightCm);
  if (!Number.isFinite(weight) || !Number.isFinite(height) || height <= 0) {
    return result({ detail: "Add a height to see BMI.", source: null, rangeLabel: "Height not saved" });
  }
  const value = weight / ((height / 100) ** 2);
  let level = "normal";
  let title = "Healthy weight range";
  let detail = `BMI ${formatBmi(value)} is inside the general adult band of 18.5–24.9.`;
  if (value < 18.5) {
    level = "low";
    title = "Below a general weight range";
    detail = `BMI ${formatBmi(value)} is under 18.5, the general adult underweight cutoff.`;
  } else if (value >= 30) {
    level = "high";
    title = "Above a general weight range";
    detail = `BMI ${formatBmi(value)} is 30 or more, a general adult obesity screening band.`;
  } else if (value >= 25) {
    level = "high";
    title = "Above a general weight range";
    detail = `BMI ${formatBmi(value)} is in the general adult overweight band of 25–29.9.`;
  }
  return result({
    level,
    title,
    detail,
    guidance: withDoctor(`${detail} ${ABOUT.bmi}`),
    seekCare: false,
    source: "general",
    rangeLabel: "General adult BMI bands (WHO-style), not a personal target",
    band: null,
    bmi: value,
  });
}

const FACTORS = {
  "mmol/L>mg/dL:glucose": 18.0182,
  "mg/dL>mmol/L:glucose": 1 / 18.0182,
  "mmol/L>mg/dL:chol": 38.67,
  "mg/dL>mmol/L:chol": 1 / 38.67,
  "mmol/L>mg/dL:trig": 88.57,
  "mg/dL>mmol/L:trig": 1 / 88.57,
  "g/L>g/dL:hb": 0.1,
  "g/dL>g/L:hb": 10,
};

function factorKey(alias) {
  if (alias === "glucose" || alias === "glucose_fasting") return "glucose";
  if (alias === "ldl" || alias === "hdl" || alias === "chol") return "chol";
  if (alias === "trig") return "trig";
  if (alias === "hb") return "hb";
  return alias;
}

function convert(value, from, to, alias) {
  if (value == null) return null;
  if (from === to) return value;
  const factor = FACTORS[`${from}>${to}:${factorKey(alias)}`];
  if (!factor) return null;
  return value * factor;
}

function hasNumericRange(record) {
  return record.refLow != null || record.refHigh != null;
}

function dangerFor(alias, value, unit) {
  if (value == null) return null;
  if (alias === "k" && unit === "mmol/L" && (value < 2.8 || value > 6.2)) {
    return "Potassium this far from a usual blood range can affect the heart rhythm. Do not take potassium supplements, or stop a prescribed medicine, because of this app.";
  }
  if (alias === "na" && unit === "mmol/L" && (value < 125 || value > 155)) {
    return "Sodium this far from a usual blood range can be dangerous. Do not start a fluid or salt plan because of this app.";
  }
  if (alias === "hb") {
    const gPerL = unit === "g/L" ? value : unit === "g/dL" ? value * 10 : null;
    if (gPerL != null && gPerL < 70) {
      return "Haemoglobin under about 70 g/L is very low and can mean there is not enough oxygen-carrying capacity.";
    }
  }
  if (alias === "glucose" || alias === "glucose_fasting") {
    const mmol = unit === "mmol/L" ? value : unit === "mg/dL" ? value / 18.0182 : null;
    if (mmol != null && mmol < 3) {
      return "A glucose under 3.0 mmol/L is very low and can be dangerous, especially with sweating, shaking, confusion, or drowsiness.";
    }
    if (mmol != null && mmol >= 15) {
      return "A glucose at or above 15 mmol/L is very high. Thirst, vomiting, deep breathing, abdominal pain, or confusion make this more urgent.";
    }
  }
  return null;
}

function guidanceFor(alias, level, usedGeneral) {
  const about = (usedGeneral && GENERAL[alias]?.about) || "";
  if (level === "normal") {
    return withDoctor(about || "This sits in the range used for comparison. Keeping the result is still useful.");
  }
  if (level === "high" || level === "low") {
    const direction = level === "high" ? "above" : "below";
    const specific = about || "The app does not have a specific note for this test name.";
    return withDoctor(`This result is ${direction} the range used for comparison. ${specific} A single out-of-range value can be a repeat, a lab variation, or something a clinician should see. People often discuss food pattern, movement, sleep, alcohol, and smoking with their doctor when fats or glucose are involved.`);
  }
  return withDoctor(about || "There is no range saved for this result, so HealthLog is not marking it high or low.");
}

export function assessLab(record) {
  const value = Number(record.value);
  const unit = canonicalUnit(record.unit);
  const alias = matchAlias(record.testName);
  if (!Number.isFinite(value)) {
    return result({ detail: "Enter a number before this result can be compared." });
  }

  let level = "unknown";
  let source = null;
  let rangeLabel = "No reference range saved";
  let band = null;
  let compareUnit = unit;

  if (hasNumericRange(record)) {
    level = compare(value, {
      low: record.refLow,
      high: record.refHigh,
      lowInclusive: record.lowInclusive !== false,
      highInclusive: record.highInclusive !== false,
    });
    source = "report";
    const printed = fmtBound({
      low: record.refLow,
      high: record.refHigh,
      lowInclusive: record.lowInclusive !== false,
      highInclusive: record.highInclusive !== false,
    }, unit);
    rangeLabel = `${printed} from your report`;
    band = { low: record.refLow, high: record.refHigh };
  } else if (record.flag === "H" || record.flag === "L") {
    level = record.flag === "H" ? "high" : "low";
    source = "report";
    rangeLabel = record.flag === "H" ? "Marked high on the report" : "Marked low on the report";
  } else if (alias && GENERAL[alias]) {
    const general = GENERAL[alias];
    const converted = convert(value, unit, general.unit, alias);
    if (converted != null) {
      level = compare(converted, general);
      source = "general";
      rangeLabel = `${fmtBound(general, general.unit)}, a general adult range (not from your report)`;
      const low = convert(general.low, general.unit, unit, alias);
      const high = convert(general.high, general.unit, unit, alias);
      band = { low, high };
      compareUnit = unit;
    }
  }

  const danger = dangerFor(alias, value, unit);
  let seekCare = false;
  let title = LEVEL_TITLE[level] || LEVEL_TITLE.unknown;
  if (source === "report" && level === "normal") title = "Within the report range";
  if (source === "report" && level === "high") title = "Above the report range";
  if (source === "report" && level === "low") title = "Below the report range";
  if (source === "general" && level === "normal") title = "Within a general adult range";
  if (source === "general" && level === "high") title = "Above a general adult range";
  if (source === "general" && level === "low") title = "Below a general adult range";

  let guidance = guidanceFor(alias, level, source === "general");
  let detail = rangeLabel;
  if (danger) {
    level = "critical";
    seekCare = true;
    title = "Seek medical care promptly";
    detail = danger;
    guidance = withDoctor(`${SEEK} ${danger}`);
  }

  return result({
    level,
    title,
    detail,
    guidance,
    seekCare,
    source,
    rangeLabel,
    band,
    alias,
    unit: compareUnit,
  });
}

export function trendNote(values) {
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (nums.length < 3) return "";
  const [a, b, c] = nums.slice(-3);
  const span = Math.abs(c - a);
  const scale = Math.max(Math.abs(a), Math.abs(c), 1);
  if (span < Math.max(0.05, scale * 0.02)) return "";
  if (b > a && c > b) return "Rising over the last 3 results.";
  if (b < a && c < b) return "Falling over the last 3 results.";
  return "";
}

export function isFlagged(level) {
  return level === "low" || level === "high" || level === "critical";
}
