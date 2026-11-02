import { STORES } from "./db.js";
import { newId } from "./id.js";
import { matchTest, reportGroupKey, specimenFromName } from "./match.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function push(errors, label) {
  errors.push(label);
}

function text(value, max, errors, label, required) {
  if (value == null || value === "") {
    if (required) push(errors, `${label} is missing.`);
    return "";
  }
  if (typeof value !== "string" && typeof value !== "number") {
    push(errors, `${label} must be text.`);
    return "";
  }
  const out = String(value).trim();
  if (out.length > max) push(errors, `${label} is too long.`);
  return out.slice(0, max);
}

function dateField(value, errors, label, required) {
  const out = text(value, 16, errors, label, required);
  if (out && !DATE_RE.test(out)) push(errors, `${label} has an invalid date.`);
  return out;
}

function numberField(value, errors, label, required) {
  if (value == null || value === "") {
    if (required) push(errors, `${label} is missing.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    push(errors, `${label} is not a number.`);
    return null;
  }
  return n;
}

function optionalNumber(value, errors, label) {
  if (value == null || value === "") return null;
  return numberField(value, errors, label, false);
}

function flagField(value) {
  return value === "H" || value === "L" ? value : "";
}

function freshId(value) {
  if (typeof value === "string" && /^[\w.-]{1,80}$/.test(value)) return value;
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function base(record, errors, label) {
  return {
    id: freshId(record.id),
    notes: text(record.notes, 2000, errors, `${label} notes`, false),
    sample: record.sample === true,
    createdAt: typeof record.createdAt === "string" ? record.createdAt.slice(0, 40) : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt.slice(0, 40) : "",
  };
}

function sanitizeLab(record, index, errors) {
  const label = `Lab result ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  const row = {
    ...base(record, errors, label),
    testName: text(record.testName, 120, errors, `${label} name`, true),
    value: numberField(record.value, errors, `${label} value`, true),
    unit: text(record.unit, 32, errors, `${label} unit`, false),
    refLow: optionalNumber(record.refLow, errors, `${label} reference low`),
    refHigh: optionalNumber(record.refHigh, errors, `${label} reference high`),
    lowInclusive: record.lowInclusive !== false,
    highInclusive: record.highInclusive !== false,
    refText: text(record.refText, 80, errors, `${label} reference text`, false),
    flag: flagField(record.flag),
    date: dateField(record.date, errors, `${label} date`, true),
    lab: text(record.lab, 120, errors, `${label} lab`, false),
  };
  return row;
}

function sanitizeBp(record, index, errors) {
  const label = `Blood pressure ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  return {
    ...base(record, errors, label),
    systolic: numberField(record.systolic, errors, `${label} systolic`, true),
    diastolic: numberField(record.diastolic, errors, `${label} diastolic`, true),
    pulse: optionalNumber(record.pulse, errors, `${label} pulse`),
    date: dateField(record.date, errors, `${label} date`, true),
  };
}

function sanitizeWeight(record, index, errors) {
  const label = `Weight ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  return {
    ...base(record, errors, label),
    kg: numberField(record.kg, errors, `${label} weight`, true),
    heightCm: optionalNumber(record.heightCm, errors, `${label} height`),
    date: dateField(record.date, errors, `${label} date`, true),
  };
}

function sanitizeGlucose(record, index, errors) {
  const label = `Blood sugar ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  const context = ["fasting", "before", "after", "random"].includes(record.context) ? record.context : "";
  if (!context) push(errors, `${label} has an invalid context.`);
  return {
    ...base(record, errors, label),
    mmol: numberField(record.mmol, errors, `${label} value`, true),
    context,
    date: dateField(record.date, errors, `${label} date`, true),
  };
}

function sanitizeMed(record, index, errors) {
  const label = `Medication ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  return {
    ...base(record, errors, label),
    name: text(record.name, 120, errors, `${label} name`, true),
    dose: text(record.dose, 80, errors, `${label} dose`, false),
    frequency: text(record.frequency, 80, errors, `${label} frequency`, false),
    start: dateField(record.start, errors, `${label} start`, false),
    end: dateField(record.end, errors, `${label} end`, false),
  };
}

function sanitizeVisit(record, index, errors) {
  const label = `Visit ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  return {
    ...base(record, errors, label),
    date: dateField(record.date, errors, `${label} date`, true),
    doctor: text(record.doctor, 120, errors, `${label} doctor`, false),
    reason: text(record.reason, 200, errors, `${label} reason`, false),
    followUp: dateField(record.followUp, errors, `${label} follow-up`, false),
  };
}

const SANITIZERS = {
  reports: sanitizeReport,
  results: sanitizeResult,
  followups: sanitizeFollow,
  customTests: sanitizeCustom,
  bp: sanitizeBp,
  weights: sanitizeWeight,
  glucose: sanitizeGlucose,
  meds: sanitizeMed,
  visits: sanitizeVisit,
};

function sanitizeResult(record, index, errors) {
  const label = `Result ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  const comparator = ["", "<", "<=", ">", ">="].includes(record.comparator) ? record.comparator : "";
  const specimen = ["", "fasting", "random"].includes(record.specimen) ? record.specimen : "";
  return {
    ...base(record, errors, label),
    testId: text(record.testId, 80, errors, `${label} test`, true),
    name: text(record.name, 120, errors, `${label} name`, false),
    reportId: text(record.reportId, 80, errors, `${label} report`, false),
    date: dateField(record.date, errors, `${label} date`, true),
    numeric: optionalNumber(record.numeric, errors, `${label} value`),
    comparator,
    qualitative: text(record.qualitative, 80, errors, `${label} qualitative`, false),
    unit: text(record.unit, 32, errors, `${label} unit`, false),
    secondaryNumeric: optionalNumber(record.secondaryNumeric, errors, `${label} secondary`),
    secondaryUnit: text(record.secondaryUnit, 32, errors, `${label} secondary unit`, false),
    specimen,
    refLow: optionalNumber(record.refLow, errors, `${label} reference low`),
    refHigh: optionalNumber(record.refHigh, errors, `${label} reference high`),
    lowInclusive: record.lowInclusive !== false,
    highInclusive: record.highInclusive !== false,
    refText: text(record.refText, 80, errors, `${label} reference text`, false),
    flag: flagField(record.flag),
  };
}

function requireResultValue(row, index, errors) {
  if (row && row.numeric == null && !row.qualitative) {
    push(errors, `Result ${index + 1} needs a value.`);
  }
  return row;
}

function sanitizeReport(record, index, errors) {
  const label = `Report ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  let fasting = null;
  if (record.fasting === true || record.fasting === false) fasting = record.fasting;
  return {
    ...base(record, errors, label),
    dateCollected: dateField(record.dateCollected, errors, `${label} date`, true),
    patientName: text(record.patientName, 120, errors, `${label} patient`, false),
    lab: text(record.lab, 120, errors, `${label} lab`, false),
    labNumber: text(record.labNumber, 80, errors, `${label} number`, false),
    doctor: text(record.doctor, 120, errors, `${label} doctor`, false),
    fasting,
  };
}

function sanitizeFollow(record, index, errors) {
  const label = `Follow-up ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  return {
    ...base(record, errors, label),
    testId: text(record.testId, 80, errors, `${label} test`, false),
    resultId: text(record.resultId, 80, errors, `${label} result`, false),
    reportId: text(record.reportId, 80, errors, `${label} report`, false),
    action: text(record.action, 200, errors, `${label} action`, true),
    date: dateField(record.date, errors, `${label} date`, true),
    done: record.done === true,
  };
}

function sanitizeCustom(record, index, errors) {
  const label = `Custom test ${index + 1}`;
  if (!isObject(record)) {
    push(errors, `${label} is not an object.`);
    return null;
  }
  const type = ["numeric", "qualitative", "text", "both"].includes(record.resultType) ? record.resultType : "numeric";
  return {
    id: freshId(record.id),
    name: text(record.name, 120, errors, `${label} name`, true),
    aliases: Array.isArray(record.aliases) ? record.aliases.map((item) => String(item).slice(0, 80)).slice(0, 20) : [],
    panel: text(record.panel, 40, errors, `${label} panel`, false) || "custom",
    unit: text(record.unit, 32, errors, `${label} unit`, false),
    resultType: type,
    ref: isObject(record.ref) ? {
      low: record.ref.low ?? null,
      high: record.ref.high ?? null,
      lowInclusive: record.ref.lowInclusive !== false,
      highInclusive: record.ref.highInclusive !== false,
      text: text(record.ref.text, 80, errors, `${label} range`, false),
    } : null,
    about: text(record.about, 400, errors, `${label} note`, false),
    sample: record.sample === true,
  };
}

function convertV1(data) {
  const labs = Array.isArray(data.labs) ? data.labs : [];
  const reports = [];
  const results = [];
  const customTests = [];
  const groups = new Map();
  labs.forEach((lab) => {
    const key = reportGroupKey(lab.date, lab.lab);
    if (!groups.has(key)) {
      const report = {
        id: newId(),
        dateCollected: String(lab.date || "").slice(0, 10),
        patientName: "",
        lab: String(lab.lab || "").trim(),
        labNumber: "",
        doctor: "",
        fasting: null,
        notes: "",
        sample: lab.sample === true,
      };
      groups.set(key, report);
      reports.push(report);
    }
    const report = groups.get(key);
    const matched = matchTest(lab.testName);
    let testId = matched?.id || "";
    if (!testId) {
      testId = `custom-${lab.id || newId()}`;
      customTests.push({
        id: testId,
        name: lab.testName || "Custom test",
        aliases: [lab.testName || ""],
        panel: "custom",
        unit: lab.unit || "",
        resultType: "numeric",
        ref: null,
        about: "Imported from a version 1 backup.",
        sample: lab.sample === true,
      });
    }
    results.push({
      id: lab.id || newId(),
      testId,
      name: lab.testName || "",
      reportId: report.id,
      date: String(lab.date || "").slice(0, 10),
      numeric: lab.value,
      comparator: "",
      qualitative: "",
      unit: lab.unit || "",
      secondaryNumeric: null,
      secondaryUnit: "",
      specimen: specimenFromName(lab.testName),
      refLow: lab.refLow ?? null,
      refHigh: lab.refHigh ?? null,
      lowInclusive: lab.lowInclusive !== false,
      highInclusive: lab.highInclusive !== false,
      refText: lab.refText || "",
      flag: lab.flag || "",
      notes: lab.notes || "",
      sample: lab.sample === true,
    });
  });
  return {
    ...data,
    reports,
    results,
    followups: [],
    customTests,
    profile: data.settings || null,
  };
}

export function profileFrom(input) {
  const source = isObject(input) ? input : {};
  const height = source.heightCm === "" || source.heightCm == null ? "" : Number(source.heightCm);
  return {
    theme: ["system", "light", "dark"].includes(source.theme) ? source.theme : "system",
    glucoseUnit: source.glucoseUnit === "mg/dL" ? "mg/dL" : "mmol/L",
    heightCm: Number.isFinite(height) ? height : "",
    hintDismissed: source.hintDismissed === true,
    patientName: text(source.patientName, 120, [], "Patient name", false),
    sex: ["", "female", "male"].includes(source.sex) ? source.sex : "",
    dob: typeof source.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.dob) ? source.dob : "",
    cvRisk: ["", "low", "moderate", "high", "veryhigh", "recurrent"].includes(source.cvRisk) ? source.cvRisk : "",
  };
}

export function sanitizeSettings(input) {
  return profileFrom(input);
}

export function validateBackup(obj) {
  const errors = [];
  if (!isObject(obj)) return { ok: false, errors: ["That file is not a HealthLog backup."] };
  if (obj.app !== "HealthLog") errors.push("This file is not a HealthLog backup.");
  if (obj.version !== 1 && obj.version !== 2) errors.push("This backup version is not supported.");
  if (!isObject(obj.data)) errors.push("The backup has no data.");
  if (errors.length) return { ok: false, errors };

  const source = obj.version === 1 ? convertV1(obj.data) : obj.data;
  const data = {};
  const counts = {};
  STORES.forEach((store) => {
    const rows = source[store];
    if (rows == null) {
      data[store] = [];
      counts[store] = 0;
      return;
    }
    if (!Array.isArray(rows)) {
      errors.push(`${store} must be a list.`);
      data[store] = [];
      counts[store] = 0;
      return;
    }
    data[store] = rows.map((row, index) => {
      const clean = SANITIZERS[store](row, index, errors);
      return store === "results" ? requireResultValue(clean, index, errors) : clean;
    }).filter(Boolean);
    counts[store] = data[store].length;
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  const profile = profileFrom(source.profile || source.settings || obj.data.settings);
  return { ok: true, data, counts, settings: profile, version: 2 };
}

export function buildBackup(data, settings) {
  const profile = profileFrom(settings);
  return {
    app: "HealthLog",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      profile,
      reports: data.reports || [],
      results: data.results || [],
      followups: data.followups || [],
      customTests: data.customTests || [],
      bp: data.bp || [],
      weights: data.weights || [],
      glucose: data.glucose || [],
      meds: data.meds || [],
      visits: data.visits || [],
    },
  };
}

function csvCell(value) {
  const textValue = value == null ? "" : String(value);
  if (/[",\n]/.test(textValue)) return `"${textValue.replace(/"/g, '""')}"`;
  return textValue;
}

export function toCsv(data) {
  const lines = [["type", "date", "name", "value", "unit", "detail", "notes"]];
  (data.results || []).forEach((row) => {
    const shown = `${row.comparator || ""}${row.numeric ?? ""}${row.qualitative ? ` ${row.qualitative}` : ""}`.trim();
    const range = [row.refLow, row.refHigh].filter((n) => n != null).join("–") || row.refText || row.flag || "";
    lines.push(["result", row.date, row.name || row.testId, shown, row.unit, range, row.notes]);
  });
  (data.bp || []).forEach((row) => {
    lines.push(["blood_pressure", row.date, "Blood pressure", `${row.systolic}/${row.diastolic}`, "mmHg", row.pulse ? `pulse ${row.pulse}` : "", row.notes]);
  });
  (data.weights || []).forEach((row) => {
    lines.push(["weight", row.date, "Weight", row.kg, "kg", row.heightCm ? `height ${row.heightCm} cm` : "", row.notes]);
  });
  (data.glucose || []).forEach((row) => {
    lines.push(["glucose", row.date, "Blood sugar", row.mmol, "mmol/L", row.context, row.notes]);
  });
  (data.meds || []).forEach((row) => {
    lines.push(["medication", row.start, row.name, row.dose, "", row.frequency, row.notes]);
  });
  (data.visits || []).forEach((row) => {
    lines.push(["visit", row.date, row.doctor, "", "", row.reason, row.notes]);
  });
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\n")}\n`;
}

export function countRecords(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}
