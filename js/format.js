export const GLUCOSE_FACTOR = 18.0182;

export function isoDate(date) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

export function addDays(days, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function todayISO() {
  return addDays(0);
}

export function nowLocalInput() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${isoDate(d)}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

export function formatWhen(value) {
  if (!value) return "";
  const [datePart, timePart] = String(value).split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  if (!y || !m || !day) return String(value);
  const dt = new Date(y, m - 1, day);
  const date = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (!timePart) return date;
  const [hh, mm] = timePart.split(":");
  return `${date}, ${hh}:${mm}`;
}

export function formatDayShort(value) {
  const [y, m, day] = String(value).split("T")[0].split("-").map(Number);
  if (!y || !m || !day) return String(value);
  return new Date(y, m - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function chartLabel(value, allDates) {
  const day = String(value).slice(0, 10);
  const dup = allDates.filter((d) => String(d).slice(0, 10) === day).length > 1;
  if (!dup || !String(value).includes("T")) return formatDayShort(value);
  return `${formatDayShort(value)} ${String(value).split("T")[1].slice(0, 5)}`;
}

export function withinRange(dateStr, range, now = new Date()) {
  if (!dateStr) return false;
  if (range === "all") return true;
  const months = { "3m": 3, "6m": 6, "1y": 12 }[range];
  if (!months) return true;
  const [y, m, d] = String(dateStr).split("T")[0].split("-").map(Number);
  const point = new Date(y, (m || 1) - 1, d || 1);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  cutoff.setMonth(cutoff.getMonth() - months);
  return point >= cutoff;
}

export function num(value) {
  if (value == null) return null;
  const text = String(value).trim().replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export function roundTo(value, places) {
  const p = 10 ** places;
  return Math.round(value * p) / p;
}

export function formatGlucose(mmol, unit) {
  if (mmol == null || Number.isNaN(Number(mmol))) return "";
  if (unit === "mg/dL") return String(Math.round(Number(mmol) * GLUCOSE_FACTOR));
  return roundTo(Number(mmol), 1).toFixed(1);
}

export function glucoseToMmol(value, unit) {
  const n = num(value);
  if (n == null) return null;
  return unit === "mg/dL" ? n / GLUCOSE_FACTOR : n;
}

export function canonicalUnit(unit) {
  if (!unit) return "";
  const key = String(unit).trim().replace(/[µμ]/g, "u").replace(/\s+/g, "").toLowerCase();
  const map = {
    "mmol/l": "mmol/L",
    "mg/dl": "mg/dL",
    "g/dl": "g/dL",
    "g/l": "g/L",
    "umol/l": "umol/L",
    "nmol/l": "nmol/L",
    "pmol/l": "pmol/L",
    "miu/l": "mIU/L",
    "uiu/ml": "uIU/mL",
    "ng/ml": "ng/mL",
    "ug/l": "ug/L",
    "mg/l": "mg/L",
    "pg/ml": "pg/mL",
    "u/l": "U/L",
    "iu/l": "IU/L",
    "iu/ml": "IU/mL",
    fl: "fL",
    pg: "pg",
    "%": "%",
    "mm/h": "mm/h",
    "mm/hr": "mm/h",
    "x10^9/l": "x10^9/L",
    "x109/l": "x10^9/L",
    "10^9/l": "x10^9/L",
    "x10^12/l": "x10^12/L",
    "x1012/l": "x10^12/L",
    "10^12/l": "x10^12/L",
    "ml/min": "mL/min",
    "ml/min/1.73m2": "mL/min",
  };
  return map[key] || String(unit).trim();
}

export function normName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(sample\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function bmi(kg, cm) {
  const weight = num(kg);
  const height = num(cm);
  if (weight == null || height == null || height <= 0) return null;
  const metres = height / 100;
  return weight / (metres * metres);
}

export function formatBmi(value) {
  if (value == null) return "";
  return roundTo(value, 1).toFixed(1);
}

export function compareDate(a, b) {
  return String(a.date || "").localeCompare(String(b.date || ""));
}

export function byDateAsc(records) {
  return [...records].sort(compareDate);
}

export function byDateDesc(records) {
  return [...records].sort((a, b) => compareDate(b, a));
}
