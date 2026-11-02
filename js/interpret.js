import { DOCTOR } from "./ranges.js";

const SEEK = "Seek medical care promptly. If you have severe symptoms, contact local emergency services (999 in Malaysia).";

const LDL_TARGETS = {
  low: { value: 3, inclusive: false, text: "<3.0" },
  moderate: { value: 2.6, inclusive: false, text: "<2.6" },
  high: { value: 1.8, inclusive: true, text: "≤1.8" },
  veryhigh: { value: 1.4, inclusive: true, text: "≤1.4" },
  recurrent: { value: 1, inclusive: false, text: "<1.0" },
};

const NONHDL_TARGETS = {
  low: { value: 3.8, inclusive: false, text: "<3.8" },
  moderate: { value: 3.4, inclusive: false, text: "<3.4" },
  high: { value: 2.6, inclusive: true, text: "≤2.6" },
  veryhigh: { value: 2.2, inclusive: true, text: "≤2.2" },
};

const CV_LABEL = {
  low: "low",
  moderate: "moderate",
  high: "high",
  veryhigh: "very high",
  recurrent: "recurrent-events",
};

export function ageYears(dob, onDate) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const on = onDate ? new Date(`${String(onDate).slice(0, 10)}T12:00:00`) : new Date();
  if (Number.isNaN(on.getTime())) return null;
  let age = on.getFullYear() - y;
  const month = on.getMonth() + 1 - m;
  if (month < 0 || (month === 0 && on.getDate() < d)) age -= 1;
  return age;
}

function compare(value, ref) {
  if (value == null || !ref) return "unknown";
  if (ref.low != null) {
    const below = ref.lowInclusive === false ? value <= ref.low : value < ref.low;
    if (below) return "low";
  }
  if (ref.high != null) {
    const above = ref.highInclusive === false ? value >= ref.high : value > ref.high;
    if (above) return "high";
  }
  if (ref.low == null && ref.high == null) return "unknown";
  return "normal";
}

function censoredLevel(value, comparator, ref) {
  if (!ref) return "unknown";
  const upperOnly = ref.low == null && ref.high != null;
  const lowerOnly = ref.high == null && ref.low != null;
  if ((comparator === "<" || comparator === "<=") && upperOnly) {
    const fits = comparator === "<"
      ? value <= ref.high
      : (ref.highInclusive ? value <= ref.high : value < ref.high);
    return fits ? "normal" : "unknown";
  }
  if ((comparator === "<" || comparator === "<=") && ref.low != null) {
    const entirelyUnder = comparator === "<" ? value <= ref.low : value < ref.low;
    if (entirelyUnder) return "low";
    if (ref.high != null) {
      const entirelyInside = comparator === "<"
        ? value <= ref.high && value > ref.low
        : value <= ref.high;
      if (entirelyInside && value <= ref.high && value > (ref.low ?? -Infinity)) return "unknown";
    }
    return "unknown";
  }
  if ((comparator === ">" || comparator === ">=") && lowerOnly) {
    const fits = comparator === ">"
      ? value >= ref.low
      : (ref.lowInclusive ? value >= ref.low : value > ref.low);
    return fits ? "normal" : "unknown";
  }
  return "unknown";
}

function reportRef(result) {
  if (result.refLow == null && result.refHigh == null) return null;
  return {
    low: result.refLow,
    high: result.refHigh,
    lowInclusive: result.lowInclusive !== false,
    highInclusive: result.highInclusive !== false,
    text: result.refText || "",
  };
}

function pack(partial) {
  const guidance = partial.guidance
    ? `${partial.guidance} ${partial.seekCare ? `${SEEK} ` : ""}${DOCTOR}`
    : partial.seekCare
      ? `${SEEK} ${DOCTOR}`
      : "";
  return {
    level: "unknown",
    title: "No range to compare",
    tier: "",
    tierLabel: "",
    rangeLabel: "No reference range saved",
    guidance,
    seekCare: false,
    source: null,
    band: null,
    ...partial,
    guidance,
  };
}

function normalizeQual(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return "";
  if (/non[-\s]?reactive/.test(text)) return "Non reactive";
  if (/not detected/.test(text)) return "Not detected";
  if (/not seen|nil|none/.test(text)) return "Not seen";
  if (/pale yellow/.test(text)) return "Pale yellow";
  if (/reactive/.test(text)) return "Reactive";
  if (/positive/.test(text)) return "Positive";
  if (/negative/.test(text)) return "Negative";
  if (/detected/.test(text)) return "Detected";
  if (text === "clear") return "Clear";
  if (text === "normal") return "Normal";
  return String(value).trim();
}

function qualitative(test, raw) {
  const value = normalizeQual(raw);
  if (!value) return null;
  if (test.qualKind === "hepa") {
    if (value === "Detected") {
      return pack({
        level: "normal",
        title: "Past exposure or vaccination",
        rangeLabel: "Detected Hep A IgG is not treated as a bad flag",
        guidance: "Detected Hep A IgG usually means an earlier infection or vaccination, not a new illness. It is not marked abnormal here.",
        source: "catalog",
      });
    }
    return pack({
      level: "info",
      title: "No Hep A IgG marker recorded",
      rangeLabel: "Not detected",
      guidance: "Not detected means this sample did not show Hep A IgG. That is not an infection flag. Whether vaccination is relevant is a question for a doctor.",
      source: "catalog",
    });
  }
  if (test.qualKind === "rpr") {
    if (value === "Non reactive") {
      return pack({ level: "normal", title: "Non reactive", rangeLabel: "Non reactive is the usual RPR result", guidance: "RPR is a syphilis screening test. Non reactive is the usual negative result.", source: "catalog" });
    }
    if (value === "Reactive") {
      return pack({ level: "high", title: "Reactive", rangeLabel: "Reactive is outside the usual RPR result", guidance: "A reactive RPR is a screening result that needs a doctor to sort out. It is not a diagnosis by itself.", source: "catalog" });
    }
  }
  if (test.qualKind === "detected") {
    if (value === "Not detected" || value === "Negative" || value === "Non reactive") {
      return pack({ level: "normal", title: value, rangeLabel: `${value} is the usual result for this screen`, guidance: `${test.about}`, source: "catalog" });
    }
    if (value === "Detected" || value === "Positive" || value === "Reactive") {
      return pack({ level: "high", title: value, rangeLabel: `${value} is outside the usual result for this screen`, guidance: `${test.name} came back ${value.toLowerCase()}. Screening tests need a confirmatory look by a doctor. This is not a diagnosis.`, source: "catalog" });
    }
  }
  if (test.qualKind === "clear") {
    if (value === "Clear") return pack({ level: "normal", title: "Clear", rangeLabel: "Clear is the usual note", guidance: test.about, source: "catalog" });
    return pack({ level: "high", title: value, rangeLabel: "Usual note on this panel: Clear", guidance: `The urine was recorded as ${value}, which differs from the usual “Clear” note.`, source: "catalog" });
  }
  if (test.qualKind === "pale") {
    if (value === "Pale yellow") return pack({ level: "normal", title: "Pale yellow", rangeLabel: "Pale yellow is the usual colour", guidance: test.about, source: "catalog" });
    return pack({ level: "high", title: value, rangeLabel: "Usual colour on this panel: Pale yellow", guidance: `The colour was recorded as ${value}, which differs from the usual pale yellow note.`, source: "catalog" });
  }
  if (test.qualKind === "negative") {
    if (value === "Negative") return pack({ level: "normal", title: "Negative", rangeLabel: "Negative is the usual dipstick result", guidance: test.about, source: "catalog" });
    return pack({ level: "high", title: value, rangeLabel: "Usual dipstick result: Negative", guidance: `${test.name} was recorded as ${value}. Dipstick findings are a prompt to talk with a doctor, not a diagnosis.`, source: "catalog" });
  }
  if (test.qualKind === "uro" || test.qualKind === "urine-glucose") {
    if (value === "Normal" || value === "Negative") return pack({ level: "normal", title: value, rangeLabel: "Normal or negative is the usual result", guidance: test.about, source: "catalog" });
    return pack({ level: "high", title: value, rangeLabel: "Usual result: Normal", guidance: `${test.name} was recorded as ${value}.`, source: "catalog" });
  }
  if (test.qualKind === "seen") {
    if (value === "Not seen") return pack({ level: "normal", title: "Not seen", rangeLabel: "Not seen is the usual note", guidance: test.about, source: "catalog" });
    return pack({ level: "info", title: value, rangeLabel: "Usual note: Not seen", guidance: `${test.name} was recorded as ${value}.`, source: "catalog" });
  }
  return null;
}

function textLevel(test, result) {
  const text = String(result.qualitative || "").trim();
  if (!text) return pack({ title: "No text saved", guidance: test.about, source: null, rangeLabel: "Text result" });
  if (/^(not seen|nil|none|negative)$/i.test(text)) {
    return pack({ level: "normal", title: text, rangeLabel: "Recorded as text", guidance: test.about, source: "catalog" });
  }
  return pack({ level: "info", title: text, rangeLabel: "Recorded as text", guidance: `${test.about} The note says “${text}”.`, source: "catalog" });
}

function hba1cTier(value) {
  if (value == null) return null;
  if (value < 5.7) return { tier: "Normal", label: "Under 5.7% (under 39 mmol/mol): a general normal screening band" };
  if (value < 6.3) return { tier: "Prediabetes range", label: "5.7–6.2% (39–44 mmol/mol): a general prediabetes screening band" };
  return { tier: "Type 2 diabetes screening range", label: "6.3% or more (45 mmol/mol or more): a general type 2 diabetes screening band. This is not a diagnosis." };
}

function egfrTier(value) {
  if (value == null) return null;
  if (value >= 90) return { tier: "G1", level: "normal", label: "G1: 90 or more, a usual normal band" };
  if (value >= 60) return { tier: "G2", level: "normal", label: "G2: 60–89, often called normal or mildly decreased" };
  if (value >= 45) return { tier: "G3a", level: "high", label: "G3a: 45–59, mildly to moderately decreased" };
  if (value >= 30) return { tier: "G3b", level: "high", label: "G3b: 30–44, moderately to severely decreased" };
  if (value >= 15) return { tier: "G4", level: "high", label: "G4: 15–29, severely decreased" };
  return { tier: "G5", level: "high", label: "G5: under 15, a kidney-failure screening band" };
}

function hscrpTier(value) {
  if (value == null) return null;
  if (value < 1) return { tier: "Low", level: "normal", label: "Under 1.0 mg/L: low cardiovascular-risk band" };
  if (value <= 3) return { tier: "Average", level: "normal", label: "1.0–3.0 mg/L: average cardiovascular-risk band" };
  if (value <= 10) return { tier: "Increased", level: "high", label: "Above 3.0 mg/L: increased cardiovascular-risk band" };
  return { tier: "Above 10", level: "high", label: "Above 10 mg/L: often repeated, and infection or inflammation is looked for" };
}

function ebvTier(value) {
  if (value == null) return null;
  if (value < 11.1) return { tier: "Negative", level: "normal", label: "Under 11.1 AU/mL: negative band on this NPC screen" };
  if (value <= 12) return { tier: "Equivocal", level: "info", label: "11.1–12.0 AU/mL: equivocal band" };
  return { tier: "Positive", level: "high", label: "Above 12.0 AU/mL: positive band on this NPC screen. It is not a diagnosis." };
}

function hpTier(value) {
  if (value == null) return null;
  if (value < 0.8) return { tier: "Negative", level: "normal", label: "Under 0.8: negative band" };
  if (value <= 0.9) return { tier: "Equivocal", level: "info", label: "0.80–0.90: equivocal band" };
  return { tier: "Positive", level: "high", label: "Above 0.90: positive band. This can mean a past or current infection. A urea breath test is a follow-up people discuss with a doctor." };
}

function aipTier(value) {
  if (value == null) return null;
  if (value < 0.1) return { tier: "Low", level: "normal", label: "Under 0.10: low band" };
  if (value <= 0.24) return { tier: "Intermediate", level: "high", label: "0.10–0.24: intermediate band" };
  return { tier: "High", level: "high", label: "Above 0.24: high band" };
}

function ratioTarget(testId, sex) {
  if (testId === "tc-hdl") {
    if (sex === "female") return { risk: 4.5, target: 4, who: "women" };
    if (sex === "male") return { risk: 5, target: 4.5, who: "men" };
    return { risk: 5, target: null, who: "unspecified" };
  }
  if (testId === "ldl-hdl") {
    if (sex === "female") return { risk: 3, target: 2.5, who: "women" };
    if (sex === "male") return { risk: 3.5, target: 3, who: "men" };
    return { risk: 3.5, target: null, who: "unspecified" };
  }
  return null;
}

function psaCutoff(age) {
  if (age == null) return { value: 3.51, text: "<3.51 (no age saved, so the general printed cut-off is used)" };
  if (age <= 49) return { value: 2.5, text: "<2.50 for ages 0–49" };
  if (age <= 59) return { value: 3.5, text: "<3.50 for ages 50–59" };
  if (age <= 69) return { value: 4.5, text: "<4.50 for ages 60–69" };
  return { value: 6.5, text: "<6.50 for ages over 70" };
}

function danger(test, value) {
  if (value == null) return null;
  if (test.id === "k" && (value < 2.8 || value > 6.2)) {
    return "Potassium this far from a usual blood range can affect heart rhythm. Do not take potassium, or stop a prescribed medicine, because of this app.";
  }
  if (test.id === "na" && (value < 125 || value > 155)) {
    return "Sodium this far from a usual blood range can be dangerous. Do not start a fluid or salt plan because of this app.";
  }
  if (test.id === "hb" && value < 70) return "Haemoglobin under about 70 g/L is very low.";
  if (test.id === "glucose" && value < 3) return "A glucose under 3.0 mmol/L is very low and can be dangerous, especially with sweating, shaking, confusion, or drowsiness.";
  if (test.id === "glucose" && value >= 15) return "A glucose at or above 15 mmol/L is very high. Thirst, vomiting, deep breathing, abdominal pain, or confusion make this more urgent.";
  return null;
}

function glucoseRef(specimen) {
  if (specimen === "random") return { ...rangeBand(3.9, 7.7), text: "Random 3.9–7.7 mmol/L" };
  return { low: 3.9, high: 6, lowInclusive: true, highInclusive: true, text: "Fasting 3.9–6.0 mmol/L. A Malaysian non-diabetic screening cut-off often cited is under 6.1." };
}

function rangeBand(low, high) {
  return { low, high, lowInclusive: true, highInclusive: true };
}

export function interpret(test, result, profile = {}) {
  if (!test) {
    const printed = reportRef(result || {});
    const level = result?.numeric != null && printed && !result.comparator
      ? compare(result.numeric, printed)
      : "unknown";
    return pack({
      level,
      title: level === "normal" ? "Within the saved range" : level === "high" ? "Above the saved range" : level === "low" ? "Below the saved range" : "Custom result",
      rangeLabel: printed ? `${printed.text || "Saved range"} from your result` : "No reference range saved",
      guidance: "This name is not in the built-in panel. The range saved with the result is the one used.",
      source: printed ? "report" : null,
      band: printed,
    });
  }
  const sex = profile.sex || "";
  const age = ageYears(profile.dob, result.date);
  const specimen = result.specimen || "";
  let tier = "";
  let tierLabel = "";
  let catalogRef = test.ref ? { ...test.ref } : null;
  let catalogNote = "";

  if (test.id === "hba1c" && result.numeric != null && !result.comparator) {
    const band = hba1cTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
  }
  if (test.id === "egfr" && result.numeric != null && !result.comparator) {
    const band = egfrTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
    catalogRef = null;
    catalogNote = band.label;
  }
  if (test.id === "hscrp" && result.numeric != null && !result.comparator) {
    const band = hscrpTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
  }
  if (test.id === "ebv" && result.numeric != null && !result.comparator) {
    const band = ebvTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
  }
  if (test.id === "hpylori" && result.numeric != null && !result.comparator) {
    const band = hpTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
  }
  if (test.id === "aip" && result.numeric != null && !result.comparator) {
    const band = aipTier(result.numeric);
    tier = band.tier;
    tierLabel = band.label;
  }
  if (test.id === "glucose") {
    catalogRef = glucoseRef(specimen === "random" ? "random" : "fasting");
    catalogNote = catalogRef.text;
  }
  if ((test.id === "ldl" || test.id === "non-hdl") && profile.cvRisk && (test.id === "ldl" ? LDL_TARGETS : NONHDL_TARGETS)[profile.cvRisk]) {
    const table = test.id === "ldl" ? LDL_TARGETS : NONHDL_TARGETS;
    const target = table[profile.cvRisk];
    catalogRef = { low: null, high: target.value, lowInclusive: true, highInclusive: target.inclusive, text: target.text };
    catalogNote = `${test.name} target ${target.text} mmol/L for the ${CV_LABEL[profile.cvRisk]} cardiovascular-risk category you selected (Malaysian CPG Dyslipidaemia 2023). This is not a personal prescription.`;
  }
  if (test.id === "tc-hdl" || test.id === "ldl-hdl") {
    const target = ratioTarget(test.id, sex);
    catalogRef = { low: null, high: target.risk, lowInclusive: true, highInclusive: false, text: `risk >${target.risk}` };
    const aim = target.target != null ? ` A printed target often cited for ${target.who} is under ${target.target}.` : " Sex is not set, so the higher of the two printed risk lines is used and both targets are listed.";
    const both = test.id === "tc-hdl"
      ? " Men: risk above 5.0, target under 4.5. Women: risk above 4.5, target under 4.0."
      : " Men: risk above 3.5, target under 3.0. Women: risk above 3.0, target under 2.5.";
    catalogNote = `${both}${aim}`;
  }
  if (test.id === "psa") {
    const cut = psaCutoff(sex === "male" ? age : null);
    catalogRef = { low: null, high: cut.value, lowInclusive: true, highInclusive: false, text: cut.text };
    catalogNote = sex === "female"
      ? "The printed PSA table is for men. It is shown only as the number you saved."
      : `Age-aware printed cut-off: ${cut.text}.`;
    if (sex !== "male") catalogRef = result.refHigh == null && result.refLow == null ? { low: null, high: 3.51, lowInclusive: true, highInclusive: false, text: "<3.51" } : catalogRef;
  }
  if (test.id === "hbsab" && result.numeric != null && !result.comparator) {
    if (result.numeric >= 10) {
      return pack({
        level: "normal",
        title: "At or above a protective level",
        tier: "Protective",
        tierLabel: "10 IU/L or more is often called protective immunity. A high result is not a bad flag.",
        rangeLabel: "≥10 IU/L, often called protective",
        guidance: "Hep B surface antibody at or above 10 IU/L is often read as protective immunity from vaccination or past infection. A high number is not marked abnormal.",
        source: "catalog",
        band: { low: 10, high: null },
      });
    }
    return pack({
      level: "info",
      title: "Below 10 IU/L",
      tier: "Below a protective level",
      tierLabel: "Under 10 IU/L is below a level often called protective. It is not an infection flag.",
      rangeLabel: "≥10 IU/L is often called protective",
      guidance: "This antibody is under 10 IU/L, a level often called protective. Whether vaccination is relevant is a question for a doctor. It is not marked as a hepatitis infection.",
      source: "catalog",
      band: { low: 10, high: null },
    });
  }

  const printed = reportRef(result);
  const usingReport = Boolean(printed);
  const ref = printed || catalogRef;
  let level = "unknown";
  if (result.numeric != null && ref) {
    level = result.comparator ? censoredLevel(result.numeric, result.comparator, ref) : compare(result.numeric, ref);
  } else if (result.qualitative && (test.resultType === "qualitative" || test.resultType === "text" || test.qualKind)) {
    const qual = test.resultType === "text" ? textLevel(test, result) : (qualitative(test, result.qualitative) || textLevel(test, result));
    if (qual) {
      return pack({
        ...qual,
        tier,
        tierLabel: tierLabel || qual.tierLabel,
        guidance: qual.guidance.replace(` ${DOCTOR}`, ""),
      });
    }
  } else if (test.resultType === "text") {
    return textLevel(test, result);
  }

  if (!usingReport && tier) {
    if (test.id === "egfr" || test.id === "hscrp" || test.id === "ebv" || test.id === "hpylori" || test.id === "aip") {
      const fromTier = test.id === "egfr" ? egfrTier(result.numeric)
        : test.id === "hscrp" ? hscrpTier(result.numeric)
          : test.id === "ebv" ? ebvTier(result.numeric)
            : test.id === "hpylori" ? hpTier(result.numeric)
              : aipTier(result.numeric);
      if (fromTier?.level) level = fromTier.level;
    }
    if (test.id === "hba1c" && !usingReport) {
      if (tier === "Normal") level = "normal";
      if (tier === "Prediabetes range" || tier === "Type 2 diabetes screening range") level = "high";
    }
  }

  if (result.flag === "H" && level === "unknown") level = "high";
  if (result.flag === "L" && level === "unknown") level = "low";

  const urgent = danger(test, result.comparator ? null : result.numeric);
  let seekCare = false;
  let title = level === "normal" ? "Within range" : level === "high" ? "Above range" : level === "low" ? "Below range" : level === "info" ? "Note" : "No range to compare";
  if (usingReport && level === "normal") title = "Within the report range";
  if (usingReport && level === "high") title = "Above the report range";
  if (usingReport && level === "low") title = "Below the report range";
  if (!usingReport && level === "normal") title = "Within the printed screening range";
  if (!usingReport && level === "high") title = "Above the printed screening range";
  if (!usingReport && level === "low") title = "Below the printed screening range";
  if (level === "unknown" && result.comparator) title = "Censored result";
  if (!usingReport && tier && ["egfr", "hba1c", "aip", "ebv", "hpylori", "hscrp"].includes(test.id)) title = tier;

  let guidance = test.about;
  if (catalogNote) guidance = `${guidance} ${catalogNote}`;
  if (tierLabel && test.id === "hba1c") guidance = `${guidance} ${tierLabel}`;
  if (level === "unknown" && result.comparator) {
    guidance = `${guidance} The result was printed as ${result.comparator}${result.numeric}, so the exact number is not known.`;
  }
  if (test.sex === "male" && sex === "female") {
    guidance = `${guidance} The printed range for this test is a male range.`;
  }
  if (urgent) {
    level = "critical";
    seekCare = true;
    title = "Seek medical care promptly";
    guidance = urgent;
  }

  const rangeLabel = usingReport
    ? `${printed.text || "Report range"} from your report`
    : (catalogNote || catalogRef?.text || test.ref?.text || "Printed screening range");

  return pack({
    level,
    title,
    tier,
    tierLabel,
    rangeLabel,
    guidance,
    seekCare,
    source: usingReport ? "report" : catalogRef || tier ? "catalog" : null,
    band: ref && (ref.low != null || ref.high != null) ? { low: ref.low, high: ref.high } : null,
  });
}

export function displayValue(result) {
  if (!result) return "";
  const parts = [];
  if (result.numeric != null && result.numeric !== "") {
    parts.push(`${result.comparator || ""}${result.numeric}`);
  }
  if (result.qualitative) parts.push(result.qualitative);
  let text = parts.join(" ");
  if (result.unit) text = `${text} ${result.unit}`.trim();
  if (result.secondaryNumeric != null && result.secondaryNumeric !== "") {
    text = `${text} (${result.secondaryNumeric}${result.secondaryUnit || "%"})`.trim();
  }
  return text.trim();
}
