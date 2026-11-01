import { STORES } from "./db.js";

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
  labs: sanitizeLab,
  bp: sanitizeBp,
  weights: sanitizeWeight,
  glucose: sanitizeGlucose,
  meds: sanitizeMed,
  visits: sanitizeVisit,
};

export function sanitizeSettings(input) {
  if (!isObject(input)) return null;
  const height = input.heightCm === "" || input.heightCm == null ? "" : Number(input.heightCm);
  return {
    theme: ["system", "light", "dark"].includes(input.theme) ? input.theme : "system",
    glucoseUnit: input.glucoseUnit === "mg/dL" ? "mg/dL" : "mmol/L",
    heightCm: Number.isFinite(height) ? height : "",
    hintDismissed: input.hintDismissed === true,
  };
}

export function validateBackup(obj) {
  const errors = [];
  if (!isObject(obj)) return { ok: false, errors: ["That file is not a HealthLog backup."] };
  if (obj.app !== "HealthLog") errors.push("This file is not a HealthLog backup.");
  if (obj.version !== 1) errors.push("This backup version is not supported.");
  if (!isObject(obj.data)) errors.push("The backup has no data.");
  if (errors.length) return { ok: false, errors };

  const data = {};
  const counts = {};
  STORES.forEach((store) => {
    const rows = obj.data[store];
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
    data[store] = rows.map((row, index) => SANITIZERS[store](row, index, errors)).filter(Boolean);
    counts[store] = data[store].length;
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 8) };
  return {
    ok: true,
    data,
    counts,
    settings: sanitizeSettings(obj.data.settings),
  };
}

export function buildBackup(data, settings) {
  return {
    app: "HealthLog",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      labs: data.labs || [],
      bp: data.bp || [],
      weights: data.weights || [],
      glucose: data.glucose || [],
      meds: data.meds || [],
      visits: data.visits || [],
      settings: settings || null,
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
  (data.labs || []).forEach((row) => {
    const range = [row.refLow, row.refHigh].filter((n) => n != null).join("–") || row.refText || row.flag || "";
    lines.push(["lab", row.date, row.testName, row.value, row.unit, range, row.notes]);
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
