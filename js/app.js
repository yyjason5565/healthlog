import { buildBackup, countRecords, toCsv, validateBackup } from "./backup.js";
import { bandColor, destroyCharts, drawChart } from "./charts.js";
import { clearStores, dump, list, newId, put, remove, removeSample, stamp, writeAll } from "./db.js";
import { saveFile } from "./files.js";
import {
  bmi,
  byDateAsc,
  byDateDesc,
  chartLabel,
  formatBmi,
  formatGlucose,
  formatWhen,
  glucoseToMmol,
  GLUCOSE_FACTOR,
  nowLocalInput,
  num,
  todayISO,
  withinRange,
} from "./format.js";
import { recognizeImage } from "./ocr.js";
import { parseLabReport, parseRange } from "./parser.js";
import { assessBmi, assessBp, assessGlucose, assessLab, isFlagged, seriesKey, trendNote } from "./ranges.js";
import { buildSample } from "./sample.js";

const SETTINGS_KEY = "healthlog.settings";
const VIEWS = ["home", "add", "scan", "trends", "more"];
const TYPE_STORE = {
  lab: "labs",
  bp: "bp",
  weight: "weights",
  glucose: "glucose",
  med: "meds",
  visit: "visits",
};

let settings = loadSettings();
let currentType = "lab";
let trendRange = "1y";
let renderToken = 0;
let toastTimer = 0;

function loadSettings() {
  const defaults = { theme: "system", glucoseUnit: "mmol/L", heightCm: "", hintDismissed: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Private mode can refuse storage; records still use IndexedDB for this tab. */
  }
}

function resolvedTheme() {
  if (settings.theme === "light" || settings.theme === "dark") return settings.theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  const meta = document.getElementById("theme-color");
  if (meta) meta.setAttribute("content", theme === "dark" ? "#101615" : "#0f6e6b");
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "hidden") node.hidden = true;
    else node.setAttribute(key, value === true ? "" : String(value));
  });
  [].concat(children).forEach((child) => {
    if (child == null || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 3600);
}

function openModal({ title, body, actions }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("modal");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body;
    const host = document.getElementById("modal-actions");
    host.replaceChildren();
    const close = (value) => {
      modal.hidden = true;
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") close("cancel");
    };
    actions.forEach((action) => {
      const button = el("button", {
        type: "button",
        class: action.className,
        text: action.label,
        "data-testid": action.id,
      });
      button.addEventListener("click", () => close(action.value));
      host.append(button);
    });
    document.addEventListener("keydown", onKey);
    modal.hidden = false;
    host.querySelector("button")?.focus();
  });
}

function setFormError(form, message) {
  const node = form.querySelector(".form-error");
  node.textContent = message || "";
  node.hidden = !message;
}

function setEditing(form, on) {
  const button = form.querySelector('[type="submit"]');
  button.textContent = on ? "Update" : button.dataset.label;
  const cancel = form.querySelector("[data-cancel-edit]");
  if (cancel) cancel.hidden = !on;
}

function resetForm(form) {
  form.reset();
  delete form.dataset.editing;
  setEditing(form, false);
  setFormError(form, "");
  const firstDate = form.querySelector('input[type="date"], input[type="datetime-local"]');
  if (firstDate) firstDate.value = firstDate.type === "date" ? todayISO() : nowLocalInput();
  if (form.dataset.form === "glucose") {
    const unit = form.querySelector('[name="unit"]');
    unit.value = settings.glucoseUnit || "mmol/L";
    unit.dataset.prev = unit.value;
  }
  if (form.dataset.form === "weight" && settings.heightCm) {
    form.heightCm.value = settings.heightCm;
  }
}

function showView(name) {
  const view = VIEWS.includes(name) ? name : "home";
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll('[role="tab"]').forEach((tab) => {
    tab.setAttribute("aria-selected", tab.dataset.tab === view ? "true" : "false");
  });
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (view === "home") renderHome();
  if (view === "add") renderEntryList();
  if (view === "trends") renderTrends();
  if (view === "more") syncSettingsForm();
}

function setAddType(type) {
  currentType = type;
  document.querySelectorAll(".type-grid [data-type]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.type === type ? "true" : "false");
  });
  document.querySelectorAll("form[data-form]").forEach((form) => {
    const on = form.dataset.form === type;
    form.hidden = !on;
    if (!on) resetForm(form);
    if (on && type === "glucose" && !form.dataset.editing) {
      const input = form.querySelector('[name="value"]');
      const unit = form.querySelector('[name="unit"]');
      if (input && unit && !input.value) {
        unit.value = settings.glucoseUnit || "mmol/L";
        unit.dataset.prev = unit.value;
      }
    }
  });
  renderEntryList();
}

function heightFor(record) {
  return record?.heightCm || settings.heightCm || null;
}

function glucoseUnit() {
  return settings.glucoseUnit === "mg/dL" ? "mg/dL" : "mmol/L";
}

function displayGlucoseNumber(mmol) {
  return glucoseUnit() === "mg/dL" ? Number(mmol) * GLUCOSE_FACTOR : Number(mmol);
}

function latestOf(records) {
  return byDateDesc(records)[0] || null;
}

function groupLabs(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = seriesKey(record.testName, record.unit);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return [...groups.values()].map((rows) => byDateAsc(rows));
}

function pill(assessment) {
  if (!assessment) return null;
  return el("span", { class: `pill ${assessment.level}`, text: assessment.title });
}

async function renderHome() {
  const token = ++renderToken;
  const data = await dump();
  if (token !== renderToken) return;
  const seek = document.getElementById("seek-slot");
  const hint = document.getElementById("hint-slot");
  const body = document.getElementById("home-body");
  seek.replaceChildren();
  hint.replaceChildren();
  body.replaceChildren();

  if (!settings.hintDismissed) {
    const card = el("article", { class: "card hint" }, [
      el("h2", { text: "Add HealthLog to your Home Screen" }),
      el("p", { text: "In Safari, tap Share, then Add to Home Screen, then open the new icon. Your records stay on this iPhone. Someone else who opens the link gets an empty tracker." }),
      el("button", { type: "button", class: "btn-secondary", text: "Hide this hint", "data-testid": "dismiss-hint" }),
    ]);
    card.querySelector("button").addEventListener("click", () => {
      settings.hintDismissed = true;
      saveSettings();
      renderHome();
    });
    hint.append(card);
  }

  const total = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  if (!total) {
    body.append(el("article", { class: "card", "data-testid": "home-empty" }, [
      el("h2", { text: "No records yet" }),
      el("p", { text: "Add a reading, scan a printed report, or open More to load fictional sample data. Nothing is stored until you do." }),
    ]));
    return;
  }

  const alerts = [];
  const latestBp = latestOf(data.bp);
  const bpAssess = latestBp ? assessBp(latestBp) : null;
  if (bpAssess?.seekCare) alerts.push(`Blood pressure ${latestBp.systolic}/${latestBp.diastolic}. ${bpAssess.detail}`);
  const latestGlucose = latestOf(data.glucose);
  const glucoseAssess = latestGlucose ? assessGlucose(latestGlucose) : null;
  if (glucoseAssess?.seekCare) {
    alerts.push(`Blood sugar ${formatGlucose(latestGlucose.mmol, glucoseUnit())} ${glucoseUnit()}. ${glucoseAssess.detail}`);
  }
  groupLabs(data.labs).forEach((series) => {
    const latest = series[series.length - 1];
    const assessment = assessLab(latest);
    if (assessment.seekCare) alerts.push(`${latest.testName} ${latest.value} ${latest.unit}. ${assessment.detail}`);
  });
  if (alerts.length) {
    const box = el("div", { class: "stack", "data-testid": "seek-care" });
    alerts.forEach((text) => {
      box.append(el("div", { class: "seek" }, [
        el("strong", { text: "Seek medical care promptly" }),
        el("p", { text }),
        el("p", { text: "HealthLog cannot tell whether this is an emergency. If you feel very unwell, contact local emergency services (999 in Malaysia)." }),
      ]));
    });
    seek.append(box);
  }

  const latestWrap = el("div", { class: "stack" }, [el("h2", { text: "Latest" })]);
  if (latestBp) {
    const note = trendNote(byDateAsc(data.bp).map((row) => row.systolic));
    latestWrap.append(metricCard("home-bp", "Blood pressure", `${latestBp.systolic}/${latestBp.diastolic}`, `mmHg · ${formatWhen(latestBp.date)}${latestBp.pulse ? ` · pulse ${latestBp.pulse}` : ""}`, bpAssess, note, latestBp.sample));
  }
  if (latestGlucose) {
    const note = trendNote(byDateAsc(data.glucose).map((row) => row.mmol));
    const context = { fasting: "Fasting", before: "Before meal", after: "After meal", random: "Random" }[latestGlucose.context] || "";
    latestWrap.append(metricCard("home-glucose", "Blood sugar", `${formatGlucose(latestGlucose.mmol, glucoseUnit())} ${glucoseUnit()}`, `${context} · ${formatWhen(latestGlucose.date)}`, glucoseAssess, note, latestGlucose.sample));
  }
  const latestWeight = latestOf(data.weights);
  if (latestWeight) {
    const height = heightFor(latestWeight);
    const bmiAssess = assessBmi(latestWeight.kg, height);
    const bmiText = bmiAssess.bmi ? ` · BMI ${formatBmi(bmiAssess.bmi)}` : " · add a height for BMI";
    const note = trendNote(byDateAsc(data.weights).map((row) => row.kg));
    latestWrap.append(metricCard("home-weight", "Weight", `${latestWeight.kg} kg`, `${formatWhen(latestWeight.date)}${bmiText}`, bmiAssess, note, latestWeight.sample));
  }
  const labSeries = groupLabs(data.labs).sort((a, b) => String(b[b.length - 1].date).localeCompare(String(a[a.length - 1].date)));
  const labHost = el("div", { class: "stack", "data-testid": "home-labs" });
  labSeries.slice(0, 6).forEach((series) => {
    const latest = series[series.length - 1];
    const assessment = assessLab(latest);
    const note = trendNote(series.map((row) => row.value));
    labHost.append(metricCard("", latest.testName, `${latest.value} ${latest.unit}`, formatWhen(latest.date), assessment, note, latest.sample));
  });
  if (labHost.childNodes.length) latestWrap.append(labHost);
  body.append(latestWrap);

  const flagged = [];
  if (bpAssess && isFlagged(bpAssess.level)) flagged.push(["Blood pressure", bpAssess]);
  if (glucoseAssess && isFlagged(glucoseAssess.level)) flagged.push(["Blood sugar", glucoseAssess]);
  if (latestWeight) {
    const bmiAssess = assessBmi(latestWeight.kg, heightFor(latestWeight));
    if (isFlagged(bmiAssess.level)) flagged.push(["BMI", bmiAssess]);
  }
  labSeries.forEach((series) => {
    const latest = series[series.length - 1];
    const assessment = assessLab(latest);
    if (isFlagged(assessment.level)) flagged.push([latest.testName, assessment]);
  });
  if (flagged.length) {
    const section = el("section", { class: "stack", "data-testid": "flagged" }, [el("h2", { text: "About these flags" })]);
    flagged.forEach(([name, assessment]) => {
      section.append(el("article", { class: "card" }, [
        el("div", { class: "row-between" }, [el("h3", { text: name }), pill(assessment)]),
        el("p", { class: "muted", text: assessment.rangeLabel }),
        el("p", { class: "guidance", text: assessment.guidance }),
      ]));
    });
    body.append(section);
  }

  const activeMeds = data.meds.filter((med) => {
    const today = todayISO();
    if (med.start && med.start > today) return false;
    if (med.end && med.end < today) return false;
    return true;
  });
  if (activeMeds.length) {
    const section = el("section", { class: "card" }, [el("h2", { text: "Medications" })]);
    activeMeds.forEach((med) => {
      section.append(el("p", { text: `${med.name}${med.dose ? ` · ${med.dose}` : ""}${med.frequency ? ` · ${med.frequency}` : ""}${med.sample ? " · Sample" : ""}` }));
    });
    body.append(section);
  }

  const followUps = data.visits
    .filter((visit) => visit.followUp && visit.followUp >= todayISO())
    .sort((a, b) => a.followUp.localeCompare(b.followUp));
  if (followUps.length) {
    const section = el("section", { class: "card" }, [el("h2", { text: "Follow-ups" })]);
    followUps.forEach((visit) => {
      section.append(el("p", { text: `${formatWhen(visit.followUp)} · ${visit.doctor || visit.reason || "Visit"}${visit.sample ? " · Sample" : ""}` }));
    });
    body.append(section);
  }
}

function metricCard(testId, title, value, meta, assessment, note, sample) {
  return el("article", { class: "card", "data-testid": testId || null }, [
    el("div", { class: "row-between" }, [
      el("h3", { text: title }),
      pill(assessment),
    ]),
    sample ? el("p", { class: "sample-tag", text: "Sample" }) : null,
    el("p", { class: "metric", text: value }),
    el("p", { class: "muted", text: meta }),
    assessment?.rangeLabel ? el("p", { class: "muted", text: assessment.rangeLabel }) : null,
    note ? el("p", { class: "trend-note", text: note, "data-testid": "trend-note" }) : null,
  ]);
}

async function renderEntryList() {
  const host = document.getElementById("entry-list");
  const rows = byDateDesc(await list(TYPE_STORE[currentType]));
  host.replaceChildren();
  if (!rows.length) {
    host.append(el("p", { class: "muted", text: "Nothing saved here yet." }));
    return;
  }
  rows.forEach((row) => host.append(entryRow(row)));
}

function entryRow(row) {
  let title = "";
  let detail = "";
  if (currentType === "lab") {
    const assessment = assessLab(row);
    title = `${row.testName} · ${row.value} ${row.unit}`;
    detail = `${formatWhen(row.date)} · ${assessment.title}`;
  } else if (currentType === "bp") {
    title = `${row.systolic}/${row.diastolic}${row.pulse ? ` · pulse ${row.pulse}` : ""}`;
    detail = `${formatWhen(row.date)} · ${assessBp(row).title}`;
  } else if (currentType === "weight") {
    const value = bmi(row.kg, heightFor(row));
    title = `${row.kg} kg${value ? ` · BMI ${formatBmi(value)}` : ""}`;
    detail = formatWhen(row.date);
  } else if (currentType === "glucose") {
    title = `${formatGlucose(row.mmol, glucoseUnit())} ${glucoseUnit()} · ${row.context}`;
    detail = formatWhen(row.date);
  } else if (currentType === "med") {
    title = row.name;
    detail = [row.dose, row.frequency, row.start && `from ${formatWhen(row.start)}`, row.end && `until ${formatWhen(row.end)}`].filter(Boolean).join(" · ");
  } else {
    title = row.doctor || row.reason || "Visit";
    detail = [formatWhen(row.date), row.reason, row.followUp && `follow-up ${formatWhen(row.followUp)}`].filter(Boolean).join(" · ");
  }
  const item = el("article", { class: "entry" }, [
    el("strong", { text: title }),
    el("p", { class: "muted", text: detail }),
    row.sample ? el("p", { class: "sample-tag", text: "Sample" }) : null,
    el("div", { class: "entry-actions" }, [
      el("button", { type: "button", text: "Edit", "data-action": "edit", "data-id": row.id }),
      el("button", { type: "button", text: "Delete", "data-action": "delete", "data-id": row.id }),
    ]),
  ]);
  return item;
}

function formFor(type) {
  return document.querySelector(`form[data-form="${type}"]`);
}

function startEdit(row) {
  const form = formFor(currentType);
  form.dataset.editing = row.id;
  setEditing(form, true);
  if (currentType === "lab") {
    form.testName.value = row.testName;
    form.value.value = row.value;
    form.unit.value = row.unit || "";
    form.refLow.value = row.refLow ?? "";
    form.refHigh.value = row.refHigh ?? "";
    form.refPrinted.value = row.refText || "";
    form.flag.value = row.flag || "";
    form.date.value = String(row.date).slice(0, 10);
    form.lab.value = row.lab || "";
    form.notes.value = row.notes || "";
  } else if (currentType === "bp") {
    form.systolic.value = row.systolic;
    form.diastolic.value = row.diastolic;
    form.pulse.value = row.pulse ?? "";
    form.date.value = row.date.length === 10 ? `${row.date}T00:00` : row.date;
    form.notes.value = row.notes || "";
  } else if (currentType === "weight") {
    form.kg.value = row.kg;
    form.heightCm.value = row.heightCm ?? "";
    form.date.value = row.date.length === 10 ? `${row.date}T00:00` : row.date;
    form.notes.value = row.notes || "";
  } else if (currentType === "glucose") {
    const unit = glucoseUnit();
    form.unit.value = unit;
    form.unit.dataset.prev = unit;
    form.value.value = formatGlucose(row.mmol, unit);
    form.context.value = row.context;
    form.date.value = row.date.length === 10 ? `${row.date}T00:00` : row.date;
    form.notes.value = row.notes || "";
  } else if (currentType === "med") {
    form.name.value = row.name;
    form.dose.value = row.dose || "";
    form.frequency.value = row.frequency || "";
    form.start.value = row.start || "";
    form.end.value = row.end || "";
    form.notes.value = row.notes || "";
  } else {
    form.date.value = String(row.date).slice(0, 10);
    form.doctor.value = row.doctor || "";
    form.reason.value = row.reason || "";
    form.notes.value = row.notes || "";
    form.followUp.value = row.followUp || "";
  }
  form.scrollIntoView({ block: "start" });
}

function rangeFromLabForm(form) {
  let refLow = num(form.refLow.value);
  let refHigh = num(form.refHigh.value);
  let lowInclusive = true;
  let highInclusive = true;
  let flag = form.flag.value;
  const printed = form.refPrinted.value.trim();
  if (refLow == null && refHigh == null && printed) {
    const parsed = parseRange(printed);
    refLow = parsed.refLow;
    refHigh = parsed.refHigh;
    lowInclusive = parsed.lowInclusive;
    highInclusive = parsed.highInclusive;
    if (!flag) flag = parsed.flag;
  }
  return { refLow, refHigh, lowInclusive, highInclusive, refText: printed, flag };
}

async function saveForm(form) {
  const type = form.dataset.form;
  const store = TYPE_STORE[type];
  const existing = form.dataset.editing
    ? (await list(store)).find((row) => row.id === form.dataset.editing)
    : null;
  let record;
  if (type === "lab") {
    const testName = form.testName.value.trim();
    const value = num(form.value.value);
    if (!testName) throw new Error("Add the test name.");
    if (value == null) throw new Error("Add a numeric result.");
    if (!form.date.value) throw new Error("Add the date.");
    const range = rangeFromLabForm(form);
    record = {
      id: existing?.id || newId(),
      testName,
      value,
      unit: form.unit.value.trim(),
      ...range,
      date: form.date.value,
      lab: form.lab.value.trim(),
      notes: form.notes.value.trim(),
      sample: existing?.sample || false,
    };
  } else if (type === "bp") {
    const systolic = num(form.systolic.value);
    const diastolic = num(form.diastolic.value);
    const pulse = num(form.pulse.value);
    if (systolic == null || diastolic == null) throw new Error("Add systolic and diastolic numbers.");
    if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 180) {
      throw new Error("Check those numbers. Systolic should be 60–260 and diastolic 30–180.");
    }
    if (systolic < diastolic) throw new Error("Systolic is usually higher than diastolic. Check the numbers.");
    if (pulse != null && (pulse < 20 || pulse > 240)) throw new Error("Check the pulse, or leave it blank.");
    record = {
      id: existing?.id || newId(),
      systolic,
      diastolic,
      pulse,
      date: form.date.value,
      notes: form.notes.value.trim(),
      sample: existing?.sample || false,
    };
  } else if (type === "weight") {
    const kg = num(form.kg.value);
    const heightCm = num(form.heightCm.value);
    if (kg == null || kg < 2 || kg > 400) throw new Error("Enter a weight in kilograms.");
    if (heightCm != null && (heightCm < 50 || heightCm > 260)) throw new Error("Enter height in centimetres, or leave it blank.");
    if (heightCm != null) {
      settings.heightCm = heightCm;
      saveSettings();
    }
    record = {
      id: existing?.id || newId(),
      kg,
      heightCm,
      date: form.date.value,
      notes: form.notes.value.trim(),
      sample: existing?.sample || false,
    };
  } else if (type === "glucose") {
    const unit = form.unit.value;
    const mmol = glucoseToMmol(form.value.value, unit);
    if (mmol == null || mmol < 0.2 || mmol > 55) throw new Error("Check the blood sugar number.");
    record = {
      id: existing?.id || newId(),
      mmol,
      context: form.context.value,
      date: form.date.value,
      notes: form.notes.value.trim(),
      sample: existing?.sample || false,
    };
  } else if (type === "med") {
    const name = form.name.value.trim();
    if (!name) throw new Error("Add the medication name.");
    record = {
      id: existing?.id || newId(),
      name,
      dose: form.dose.value.trim(),
      frequency: form.frequency.value.trim(),
      start: form.start.value,
      end: form.end.value,
      notes: form.notes.value.trim(),
      sample: existing?.sample || false,
    };
  } else {
    if (!form.date.value) throw new Error("Add the visit date.");
    record = {
      id: existing?.id || newId(),
      date: form.date.value,
      doctor: form.doctor.value.trim(),
      reason: form.reason.value.trim(),
      notes: form.notes.value.trim(),
      followUp: form.followUp.value,
      sample: existing?.sample || false,
    };
  }
  await put(store, stamp(record, existing));
  resetForm(form);
  await renderEntryList();
  toast("Saved on this device.");
}

function pointColor(level) {
  if (level === "critical") return cssVar("--chart-bad");
  if (level === "high" || level === "low") return cssVar("--chart-flag");
  return cssVar("--chart-normal");
}

function chartCard({ title, testId, labels, datasets, yTitle, band, caption, note, points }) {
  const canvas = el("canvas", { "data-testid": testId, role: "img", "aria-label": title });
  const box = el("div", { class: "chart-box" }, [canvas]);
  const list = el("ol", { class: "point-list" });
  points.slice(-6).forEach((point) => list.append(el("li", { text: point })));
  const card = el("article", { class: "card" }, [
    el("h2", { text: title }),
    box,
    caption ? el("p", { class: "muted", text: caption }) : null,
    note ? el("p", { class: "trend-note", text: note }) : null,
    list,
  ]);
  card._chart = { canvas, labels, datasets, yTitle, band };
  return card;
}

function mountChart(card) {
  if (!card._chart) return;
  drawChart(card._chart.canvas, { ...card._chart, extras: [] });
}

async function renderTrends() {
  const token = ++renderToken;
  const data = await dump();
  if (token !== renderToken) return;
  destroyCharts();
  const host = document.getElementById("trend-charts");
  host.replaceChildren();
  document.querySelectorAll(".segment [data-range]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.range === trendRange ? "true" : "false");
  });
  const inRange = (row) => withinRange(row.date, trendRange);
  let any = false;

  const bp = byDateAsc(data.bp.filter(inRange));
  if (bp.length) {
    any = true;
    const labels = bp.map((row) => chartLabel(row.date, bp.map((item) => item.date)));
    const colors = bp.map((row) => pointColor(assessBp(row).level));
    const bpCard = chartCard({
      title: "Blood pressure",
      testId: "chart-bp",
      labels,
      yTitle: "mmHg",
      datasets: [
        { label: "Systolic", data: bp.map((row) => row.systolic), borderColor: cssVar("--chart-1"), backgroundColor: cssVar("--chart-1"), pointBackgroundColor: colors },
        { label: "Diastolic", data: bp.map((row) => row.diastolic), borderColor: cssVar("--chart-2"), backgroundColor: cssVar("--chart-2"), pointBackgroundColor: colors },
      ],
      caption: "General adult categories: normal under 120/80, high from 130/80, seek care at 180/120 or higher. No shaded band, because the two lines use different cutoffs.",
      note: trendNote(bp.map((row) => row.systolic)).replace("Rising", "Systolic is rising").replace("Falling", "Systolic is falling"),
      points: bp.map((row) => `${formatWhen(row.date)} · ${row.systolic}/${row.diastolic}`),
    });
    host.append(bpCard);
    mountChart(bpCard);
  }

  const weights = byDateAsc(data.weights.filter(inRange));
  if (weights.length) {
    any = true;
    const labels = weights.map((row) => chartLabel(row.date, weights.map((item) => item.date)));
    const weightCard = chartCard({
      title: "Weight",
      testId: "chart-weight",
      labels,
      yTitle: "kg",
      datasets: [{
        label: "Weight",
        data: weights.map((row) => row.kg),
        borderColor: cssVar("--chart-1"),
        backgroundColor: cssVar("--chart-1"),
        pointBackgroundColor: weights.map((row) => pointColor(assessBmi(row.kg, heightFor(row)).level)),
      }],
      caption: "BMI uses the height saved with the reading, or the height in More.",
      note: trendNote(weights.map((row) => row.kg)),
      points: weights.map((row) => {
        const value = bmi(row.kg, heightFor(row));
        return `${formatWhen(row.date)} · ${row.kg} kg${value ? ` · BMI ${formatBmi(value)}` : ""}`;
      }),
    });
    host.append(weightCard);
    mountChart(weightCard);
  }

  const glucose = byDateAsc(data.glucose.filter(inRange));
  if (glucose.length) {
    any = true;
    const unit = glucoseUnit();
    const latest = assessGlucose(glucose[glucose.length - 1]);
    const labels = glucose.map((row) => chartLabel(row.date, glucose.map((item) => item.date)));
    const band = latest.band ? {
      low: latest.band.low == null ? null : displayGlucoseNumber(latest.band.low),
      high: latest.band.high == null ? null : displayGlucoseNumber(latest.band.high),
      color: bandColor(),
    } : null;
    const glucoseCard = chartCard({
      title: "Blood sugar",
      testId: "chart-glucose",
      labels,
      yTitle: unit,
      band,
      datasets: [{
        label: unit,
        data: glucose.map((row) => displayGlucoseNumber(row.mmol)),
        borderColor: cssVar("--chart-1"),
        backgroundColor: cssVar("--chart-1"),
        pointBackgroundColor: glucose.map((row) => pointColor(assessGlucose(row).level)),
      }],
      caption: `${latest.rangeLabel}. The shaded band follows the latest reading’s context. Very low is under 3.0 mmol/L and very high is 15 mmol/L or more.`,
      note: trendNote(glucose.map((row) => row.mmol)),
      points: glucose.map((row) => `${formatWhen(row.date)} · ${formatGlucose(row.mmol, unit)} ${unit} · ${row.context}`),
    });
    host.append(glucoseCard);
    mountChart(glucoseCard);
  }

  groupLabs(data.labs).forEach((series) => {
    if (series.length < 2) return;
    const rows = series.filter(inRange);
    if (!rows.length) return;
    any = true;
    const latest = rows[rows.length - 1];
    const assessment = assessLab(latest);
    const name = latest.testName.replace(/\s*\(SAMPLE\)/i, "");
    const labels = rows.map((row) => chartLabel(row.date, rows.map((item) => item.date)));
    const band = assessment.band && (assessment.band.low != null || assessment.band.high != null)
      ? { low: assessment.band.low, high: assessment.band.high, color: bandColor() }
      : null;
    const labCard = chartCard({
      title: name,
      testId: "chart-lab",
      labels,
      yTitle: latest.unit || "",
      band,
      datasets: [{
        label: latest.unit || "Value",
        data: rows.map((row) => row.value),
        borderColor: cssVar("--chart-1"),
        backgroundColor: cssVar("--chart-1"),
        pointBackgroundColor: rows.map((row) => pointColor(assessLab(row).level)),
      }],
      caption: assessment.rangeLabel,
      note: trendNote(rows.map((row) => row.value)),
      points: rows.map((row) => `${formatWhen(row.date)} · ${row.value} ${row.unit}`),
    });
    host.append(labCard);
    mountChart(labCard);
  });

  if (!any) {
    host.append(el("article", { class: "card" }, [
      el("h2", { text: "No chart yet" }),
      el("p", { text: "Charts appear after you save readings in this time range. Lab tests need at least two results." }),
    ]));
  }
}

function friendlyStatus(status) {
  const text = String(status || "").toLowerCase();
  if (text.includes("prepar")) return "Preparing the photo…";
  if (text.includes("core")) return "Preparing the on-device reader…";
  if (text.includes("language") || text.includes("trained")) return "Loading English text recognition…";
  if (text.includes("initial")) return "Starting recognition…";
  if (text.includes("recogn")) return "Reading the photo…";
  return "Working…";
}

function showProgress(message, ratio) {
  const wrap = document.getElementById("ocr-progress");
  wrap.hidden = false;
  wrap.querySelector("[data-testid=progress-label]").textContent = message;
  const pct = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
  wrap.querySelector("[data-testid=progress-bar]").style.width = `${pct}%`;
}

function hideProgress() {
  document.getElementById("ocr-progress").hidden = true;
}

function setOcrError(message) {
  const node = document.getElementById("ocr-error");
  node.textContent = message || "";
  node.hidden = !message;
}

function blankRow() {
  return {
    testName: "",
    value: "",
    unit: "",
    refLow: "",
    refHigh: "",
    refText: "",
    flag: "",
    lowInclusive: true,
    highInclusive: true,
  };
}

function reviewRowElement(row) {
  const card = el("div", { class: "review-row", "data-testid": "review-row" });
  card.dataset.lowInclusive = row.lowInclusive === false ? "false" : "true";
  card.dataset.highInclusive = row.highInclusive === false ? "false" : "true";
  const name = field("Test", "text", row.testName, "row-name");
  name.classList.add("span-2");
  const value = field("Value", "text", row.value, "row-value");
  value.querySelector("input").inputMode = "decimal";
  const unit = field("Unit", "text", row.unit, "row-unit");
  const low = field("Ref low", "text", row.refLow ?? "", "row-low");
  const high = field("Ref high", "text", row.refHigh ?? "", "row-high");
  low.querySelector("input").inputMode = "decimal";
  high.querySelector("input").inputMode = "decimal";
  const printed = field("Range as printed", "text", row.refText || "", "row-reftext");
  printed.classList.add("span-2");
  const flagWrap = el("label", { class: "field" }, ["Flag"]);
  const flag = el("select", { "data-testid": "row-flag" });
  [["", "None"], ["H", "H"], ["L", "L"]].forEach(([value, label]) => {
    const option = el("option", { value, text: label });
    if (value === (row.flag || "")) option.selected = true;
    flag.append(option);
  });
  flagWrap.append(flag);
  const remove = el("button", { type: "button", class: "btn-secondary", text: "Remove row", "data-testid": "remove-row" });
  const preview = el("p", { class: "muted span-2", "data-testid": "row-preview", text: previewText(row) });
  [low, high].forEach((wrap) => {
    wrap.querySelector("input").addEventListener("input", () => {
      card.dataset.lowInclusive = "true";
      card.dataset.highInclusive = "true";
      preview.textContent = previewText(readOne(card));
    });
  });
  card.addEventListener("input", () => {
    preview.textContent = previewText(readOne(card));
  });
  remove.addEventListener("click", () => {
    const rows = readReviewRows().filter((item) => item.el !== card);
    renderReview(rows);
  });
  card.append(name, value, unit, low, high, printed, flagWrap, remove, preview);
  return card;
}

function field(label, type, value, testId) {
  const input = el("input", { type, "data-testid": testId, value: value == null ? "" : String(value) });
  return el("label", { class: "field" }, [label, input]);
}

function readOne(card) {
  const value = card.querySelector('[data-testid="row-value"]').value;
  return {
    el: card,
    testName: card.querySelector('[data-testid="row-name"]').value.trim(),
    value,
    unit: card.querySelector('[data-testid="row-unit"]').value.trim(),
    refLow: card.querySelector('[data-testid="row-low"]').value,
    refHigh: card.querySelector('[data-testid="row-high"]').value,
    refText: card.querySelector('[data-testid="row-reftext"]').value.trim(),
    flag: card.querySelector('[data-testid="row-flag"]').value,
    lowInclusive: card.dataset.lowInclusive !== "false",
    highInclusive: card.dataset.highInclusive !== "false",
  };
}

function readReviewRows() {
  return [...document.querySelectorAll("[data-testid=review-row]")].map(readOne);
}

function previewText(row) {
  const value = num(row.value);
  if (!row.testName || value == null) return "Enter a test name and a value.";
  const assessment = assessLab({
    testName: row.testName,
    value,
    unit: row.unit,
    refLow: num(row.refLow),
    refHigh: num(row.refHigh),
    lowInclusive: row.lowInclusive !== false,
    highInclusive: row.highInclusive !== false,
    flag: row.flag,
    refText: row.refText,
  });
  return `${assessment.title}. ${assessment.rangeLabel}`;
}

function renderReview(rows) {
  const host = document.getElementById("review-rows");
  host.replaceChildren();
  (rows.length ? rows : [blankRow()]).forEach((row) => host.append(reviewRowElement(row)));
}

function openReview(text) {
  const parsed = parseLabReport(text);
  document.getElementById("ocr-raw").textContent = text || "";
  const date = document.getElementById("review-date");
  const lab = document.getElementById("review-lab");
  if (parsed.suggestedDate) date.value = parsed.suggestedDate;
  else if (!date.value) date.value = todayISO();
  if (parsed.suggestedLab) lab.value = parsed.suggestedLab;
  document.getElementById("review-empty").hidden = parsed.rows.length > 0;
  renderReview(parsed.rows);
  const review = document.getElementById("review");
  review.hidden = false;
  review.scrollIntoView({ block: "start" });
}

async function onImage(file) {
  if (!file) return;
  setOcrError("");
  showProgress("Preparing the photo…", 0.02);
  try {
    const text = await recognizeImage(file, (message) => {
      showProgress(friendlyStatus(message.status), Number(message.progress) || 0);
    });
    hideProgress();
    openReview(text);
  } catch (err) {
    hideProgress();
    setOcrError(`${err.message || "The photo could not be read."} Nothing was saved. You can paste the text instead.`);
  }
}

async function saveReview() {
  const date = document.getElementById("review-date").value;
  const labName = document.getElementById("review-lab").value.trim();
  if (!date) {
    setOcrError("Add the report date before saving.");
    return;
  }
  const saved = [];
  for (const row of readReviewRows()) {
    const value = num(row.value);
    const empty = !row.testName && value == null && !row.unit;
    if (empty) continue;
    if (!row.testName || value == null) {
      setOcrError("Each row needs a test name and a numeric value. Nothing new was saved.");
      return;
    }
    let refLow = num(row.refLow);
    let refHigh = num(row.refHigh);
    let { lowInclusive, highInclusive, flag, refText } = row;
    if (refLow == null && refHigh == null && refText) {
      const parsed = parseRange(refText);
      refLow = parsed.refLow;
      refHigh = parsed.refHigh;
      lowInclusive = parsed.lowInclusive;
      highInclusive = parsed.highInclusive;
      if (!flag) flag = parsed.flag;
    }
    saved.push(stamp({
      id: newId(),
      testName: row.testName,
      value,
      unit: row.unit,
      refLow,
      refHigh,
      lowInclusive,
      highInclusive,
      refText,
      flag,
      date,
      lab: labName,
      notes: "",
      sample: false,
    }));
  }
  if (!saved.length) {
    setOcrError("Add at least one result before saving.");
    return;
  }
  for (const record of saved) await put("labs", record);
  document.getElementById("review").hidden = true;
  document.getElementById("review-rows").replaceChildren();
  document.getElementById("paste-text").value = "";
  setOcrError("");
  toast(`Saved ${saved.length} result${saved.length === 1 ? "" : "s"} on this device.`);
  showView("home");
}

function syncSettingsForm() {
  document.getElementById("set-theme").value = settings.theme || "system";
  document.getElementById("set-glucose-unit").value = glucoseUnit();
  document.getElementById("set-height").value = settings.heightCm || "";
}

async function exportJson() {
  const data = await dump();
  const payload = buildBackup(data, settings);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const result = await saveFile(`healthlog-backup-${todayISO()}.json`, blob);
  if (result === "downloaded") toast("Backup downloaded. On iPhone, keep it in Files from the share sheet or Downloads.");
  if (result === "shared") toast("Backup opened in the share sheet.");
}

async function exportCsv() {
  const data = await dump();
  const blob = new Blob([toCsv(data)], { type: "text/csv" });
  const result = await saveFile(`healthlog-readings-${todayISO()}.csv`, blob);
  if (result === "downloaded") toast("CSV downloaded.");
  if (result === "shared") toast("CSV opened in the share sheet.");
}

async function importFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    await openModal({
      title: "Could not read that file",
      body: "Choose a HealthLog JSON backup.",
      actions: [{ id: "modal-ok", label: "OK", value: "ok", className: "btn-primary" }],
    });
    return;
  }
  const result = validateBackup(parsed);
  if (!result.ok) {
    await openModal({
      title: "Backup not imported",
      body: result.errors.join("\n"),
      actions: [{ id: "modal-ok", label: "OK", value: "ok", className: "btn-primary" }],
    });
    return;
  }
  const choice = await openModal({
    title: "Import backup",
    body: `This file has ${countRecords(result.counts)} records. Merge keeps what is already on this device and updates matching ids. Replace deletes everything on this device first.`,
    actions: [
      { id: "modal-merge", label: "Merge", value: "merge", className: "btn-primary" },
      { id: "modal-replace", label: "Replace", value: "replace", className: "btn-danger" },
      { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
    ],
  });
  if (choice !== "merge" && choice !== "replace") return;
  await writeAll(result.data, choice);
  if (result.settings) {
    settings = { ...settings, ...result.settings };
    saveSettings();
    applyTheme();
  }
  toast(choice === "replace" ? "This device now matches the backup." : "Backup merged on this device.");
  showView("home");
}

function bind() {
  document.querySelector(".tabbar").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) showView(tab.dataset.tab);
  });
  window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
  document.querySelector(".type-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (button) setAddType(button.dataset.type);
  });
  document.getElementById("view-add").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    setFormError(form, "");
    try {
      await saveForm(form);
    } catch (err) {
      setFormError(form, err.message || "Could not save.");
    }
  });
  document.querySelectorAll("[data-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => resetForm(button.form));
  });
  document.getElementById("entry-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const rows = await list(TYPE_STORE[currentType]);
    const row = rows.find((item) => item.id === button.dataset.id);
    if (!row) return;
    if (button.dataset.action === "edit") startEdit(row);
    if (button.dataset.action === "delete") {
      const choice = await openModal({
        title: "Delete this entry?",
        body: "It will be removed from this device only.",
        actions: [
          { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
          { id: "modal-confirm", label: "Delete", value: "confirm", className: "btn-danger" },
        ],
      });
      if (choice !== "confirm") return;
      await remove(TYPE_STORE[currentType], row.id);
      if (formFor(currentType).dataset.editing === row.id) resetForm(formFor(currentType));
      await renderEntryList();
      toast("Deleted from this device.");
    }
  });
  const glucoseUnitSelect = document.querySelector('#form-glucose [name="unit"]');
  glucoseUnitSelect.addEventListener("change", () => {
    const previous = glucoseUnitSelect.dataset.prev || "mmol/L";
    const current = glucoseUnitSelect.value;
    const input = document.querySelector('#form-glucose [name="value"]');
    const mmol = glucoseToMmol(input.value, previous);
    if (mmol != null) input.value = formatGlucose(mmol, current);
    glucoseUnitSelect.dataset.prev = current;
  });
  document.getElementById("scan-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    onImage(file);
  });
  document.getElementById("scan-camera").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    onImage(file);
  });
  document.getElementById("show-paste").addEventListener("click", () => {
    document.getElementById("paste-wrap").hidden = false;
    document.getElementById("parse-paste").hidden = false;
    document.getElementById("paste-text").focus();
  });
  document.getElementById("parse-paste").addEventListener("click", () => {
    const text = document.getElementById("paste-text").value;
    if (!text.trim()) {
      setOcrError("Paste the report text first. Nothing was saved.");
      return;
    }
    setOcrError("");
    openReview(text);
  });
  document.getElementById("add-row").addEventListener("click", () => {
    renderReview(readReviewRows().concat(blankRow()));
  });
  document.getElementById("save-review").addEventListener("click", () => {
    saveReview().catch((err) => setOcrError(err.message || "Could not save."));
  });
  document.querySelector(".segment").addEventListener("click", (event) => {
    const button = event.target.closest("[data-range]");
    if (!button) return;
    trendRange = button.dataset.range;
    renderTrends();
  });
  document.getElementById("set-theme").addEventListener("change", (event) => {
    settings.theme = event.target.value;
    saveSettings();
    applyTheme();
    if (!document.getElementById("view-trends").hidden) renderTrends();
  });
  document.getElementById("set-glucose-unit").addEventListener("change", (event) => {
    settings.glucoseUnit = event.target.value;
    saveSettings();
    toast(`Blood sugar will show in ${settings.glucoseUnit}.`);
  });
  document.getElementById("set-height").addEventListener("change", (event) => {
    const value = num(event.target.value);
    if (event.target.value && (value == null || value < 50 || value > 260)) {
      toast("Enter height in centimetres, for example 165.");
      event.target.value = settings.heightCm || "";
      return;
    }
    settings.heightCm = value || "";
    saveSettings();
    toast("Height saved on this device.");
  });
  document.getElementById("export-json").addEventListener("click", () => {
    exportJson().catch(() => toast("Could not export the backup."));
  });
  document.getElementById("export-csv").addEventListener("click", () => {
    exportCsv().catch(() => toast("Could not export the CSV."));
  });
  document.getElementById("import-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) importFile(file).catch(() => toast("Could not import that file."));
  });
  document.getElementById("load-sample").addEventListener("click", async () => {
    const choice = await openModal({
      title: "Load fictional sample data?",
      body: "This adds labelled SAMPLE rows on this device so you can try charts and flags. It is not real health data. Existing sample rows are replaced.",
      actions: [
        { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
        { id: "modal-confirm", label: "Load sample data", value: "confirm", className: "btn-primary" },
      ],
    });
    if (choice !== "confirm") return;
    await removeSample();
    await writeAll(buildSample(), "merge");
    toast("Fictional sample data was added on this device.");
    showView("home");
  });
  document.getElementById("clear-sample").addEventListener("click", async () => {
    await removeSample();
    toast("Sample data was removed from this device.");
    showView("home");
  });
  document.getElementById("delete-all").addEventListener("click", async () => {
    const data = await dump();
    const count = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
    const choice = await openModal({
      title: "Delete all health data?",
      body: `This removes ${count} records from this device. Theme and unit settings stay. Export a backup first if you might want them back. This cannot be undone.`,
      actions: [
        { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
        { id: "modal-confirm", label: "Delete all data", value: "confirm", className: "btn-danger" },
      ],
    });
    if (choice !== "confirm") return;
    await clearStores();
    toast("All health records on this device were deleted.");
    showView("home");
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settings.theme === "system") applyTheme();
  });
}

async function init() {
  applyTheme();
  bind();
  document.querySelectorAll("form[data-form]").forEach(resetForm);
  setAddType("lab");
  const initial = location.hash.slice(1);
  showView(VIEWS.includes(initial) ? initial : "home");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

init();
