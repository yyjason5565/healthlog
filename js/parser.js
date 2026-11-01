import { canonicalUnit } from "./format.js";

const UNIT_SRC = [
  "x\\s?10\\^[69]/l",
  "x\\s?10[69]/l",
  "10\\^[69]/l",
  "10\\*[69]/l",
  "mmol/l",
  "mg/dl",
  "g/dl",
  "umol/l",
  "nmol/l",
  "pmol/l",
  "miu/l",
  "uiu/ml",
  "iu/ml",
  "ng/ml",
  "ug/l",
  "mg/l",
  "pg/ml",
  "mm/hr?",
  "ml/min(?:/1\\.73m2)?",
  "g/l",
  "u/l",
  "iu/l",
  "fl",
  "%",
].join("|");

const LINE_RE = new RegExp(
  `^(.+?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*(${UNIT_SRC})(?![a-z0-9])(.*)$`,
  "i",
);

const STOP_NAMES = new Set([
  "test",
  "tests",
  "result",
  "results",
  "unit",
  "units",
  "reference",
  "range",
  "flag",
  "date",
  "page",
  "patient",
  "name",
  "laboratory",
  "report",
  "specimen",
  "comment",
  "comments",
  "method",
  "status",
  "printed",
  "collected",
  "reported",
  "phone",
  "fax",
  "sample",
]);

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeOcrText(raw) {
  return String(raw || "")
    .replace(/\r/g, "\n")
    .replace(/[µμ]/g, "u")
    .replace(/[×]/g, "x")
    .replace(/[–—−]/g, "-")
    .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*\^\s*/g, "^")
    .replace(/x10\^?9\/l/gi, "x10^9/L")
    .replace(/x1079\/l/gi, "x10^9/L")
    .replace(/x10\^?12\/l/gi, "x10^12/L")
    .replace(/x1012\/l/gi, "x10^12/L")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ");
}

function normalizeLine(line) {
  return normalizeOcrText(line).replace(/\s+/g, " ").trim();
}

function splitFlag(text) {
  const source = String(text || "").trim();
  const patterns = [
    /^(.*\d)\s*(HIGH|LOW|H|L)\s*$/i,
    /^(.*)\s+(HIGH|LOW|H|L)\s*$/i,
  ];
  for (const re of patterns) {
    const match = source.match(re);
    if (!match) continue;
    const word = match[2].toUpperCase();
    return {
      rest: match[1].trim(),
      flag: word.startsWith("H") ? "H" : "L",
    };
  }
  return { rest: source, flag: "" };
}

export function parseRange(text) {
  const { rest, flag } = splitFlag(text);
  const source = rest.replace(/^[\s:–-]+/, "").trim();
  let match = source.match(/(-?\d+(?:\.\d+)?)\s*(?:-|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (match) {
    return {
      refLow: cleanNumber(match[1]),
      refHigh: cleanNumber(match[2]),
      lowInclusive: true,
      highInclusive: true,
      refText: `${match[1]} - ${match[2]}`,
      flag,
    };
  }
  match = source.match(/<\s*(=)?\s*(-?\d+(?:\.\d+)?)/);
  if (match) {
    return {
      refLow: null,
      refHigh: cleanNumber(match[2]),
      lowInclusive: true,
      highInclusive: Boolean(match[1]),
      refText: `<${match[1] ? "=" : ""}${match[2]}`,
      flag,
    };
  }
  match = source.match(/>\s*(=)?\s*(-?\d+(?:\.\d+)?)/);
  if (match) {
    return {
      refLow: cleanNumber(match[2]),
      refHigh: null,
      lowInclusive: Boolean(match[1]),
      highInclusive: true,
      refText: `>${match[1] ? "=" : ""}${match[2]}`,
      flag,
    };
  }
  return {
    refLow: null,
    refHigh: null,
    lowInclusive: true,
    highInclusive: true,
    refText: source,
    flag,
  };
}

function correctTestName(name) {
  const compact = name.replace(/\s+/g, "");
  if (/^hba[1li|]c$/i.test(compact)) return "HbA1c";
  return name;
}

function acceptableName(name) {
  if (!name || name.length < 2 || name.length > 60) return false;
  if (!/[A-Za-z]/.test(name)) return false;
  const key = name.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (STOP_NAMES.has(key)) return false;
  if (/^\d/.test(name) && !/^(25|b12|hb)/i.test(name)) return false;
  return true;
}

function parseLineOnce(line) {
  const match = line.match(LINE_RE);
  if (!match) return null;
  const name = correctTestName(match[1].replace(/[:|]+$/g, "").trim());
  if (!acceptableName(name)) return null;
  const value = cleanNumber(match[2]);
  if (value == null || Math.abs(value) > 100000) return null;
  const unit = canonicalUnit(match[3]);
  const range = parseRange(match[4] || "");
  return {
    testName: name,
    value,
    unit,
    refLow: range.refLow,
    refHigh: range.refHigh,
    lowInclusive: range.lowInclusive,
    highInclusive: range.highInclusive,
    refText: range.refText,
    flag: range.flag,
  };
}

export function parseLine(line) {
  const cleaned = normalizeLine(line);
  const repaired = cleaned.replace(/(\d)[Oo](\d)/g, (_m, a, b) => `${a}0${b}`);
  return parseLineOnce(cleaned) || parseLineOnce(repaired);
}

function looksLikeNameOnly(line) {
  if (parseLine(line)) return false;
  if (line.length < 3 || line.length > 40) return false;
  if (!/[A-Za-z]/.test(line)) return false;
  if (/\d{3,}/.test(line)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9 .()+\-/]+$/.test(line);
}

function mergeWrapped(lines) {
  const merged = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] || "";
    if (looksLikeNameOnly(line) && /^\d/.test(next)) {
      merged.push(`${line} ${next}`);
      i += 1;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toIso(year, month, day) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function guessDate(text) {
  const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const found = [];
  lines.forEach((line, index) => {
    const dates = [];
    const named = /(?:^|\b)(\d{1,2})[ /-]([A-Za-z]{3,9})[ /-](\d{4})\b/g;
    let match = named.exec(line);
    while (match) {
      const month = MONTHS[match[2].toLowerCase()];
      const iso = month ? toIso(Number(match[3]), month, Number(match[1])) : "";
      if (iso) dates.push(iso);
      match = named.exec(line);
    }
    const numeric = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    match = numeric.exec(line);
    while (match) {
      const iso = toIso(Number(match[1]), Number(match[2]), Number(match[3]));
      if (iso) dates.push(iso);
      match = numeric.exec(line);
    }
    const slash = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g;
    match = slash.exec(line);
    while (match) {
      const iso = toIso(Number(match[3]), Number(match[2]), Number(match[1]));
      if (iso) dates.push(iso);
      match = slash.exec(line);
    }
    dates.forEach((iso) => found.push({ iso, line, index }));
  });
  const preferred = found.find((item) => /reported/i.test(item.line))
    || found.find((item) => /collect/i.test(item.line))
    || found[0];
  return preferred ? preferred.iso : "";
}

export function guessLab(text) {
  const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 14);
  for (const line of lines) {
    if (line.length > 80) continue;
    if (/laborator|pathology|diagnostic|clinic|hospital/i.test(line)) {
      return line.replace(/\s+/g, " ");
    }
  }
  return "";
}

export function parseLabReport(raw) {
  const text = String(raw || "").replace(/\r/g, "");
  const lines = text.split("\n").map(normalizeLine).filter(Boolean);
  const rows = [];
  const seen = new Set();
  mergeWrapped(lines).forEach((line) => {
    const row = parseLine(line);
    if (!row) return;
    const key = `${row.testName.toLowerCase()}|${row.value}|${row.unit}|${row.refText}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  });
  return {
    rows,
    suggestedDate: guessDate(text),
    suggestedLab: guessLab(text),
  };
}
