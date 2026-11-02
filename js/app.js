import { buildBackup, countRecords, profileFrom, toCsv, validateBackup } from "./backup.js";
import { bandColor, destroyCharts, drawChart } from "./charts.js";
import { CATALOG, PANELS, QUAL_CHOICES, findTest, panelLabel, testsFor } from "./catalog.js";
import { clearStores, dump, list, newId, put, putMany, remove, removeSample, stamp, writeAll } from "./db.js";
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
import { displayValue, interpret } from "./interpret.js";
import { matchTest, specimenFromName } from "./match.js";
import { recognizeImage } from "./ocr.js";
import { parseLabReport, parseRange } from "./parser.js";
import { assessBmi, assessBp, assessGlucose, isFlagged, trendNote } from "./ranges.js";
import { buildSample } from "./sample.js";

const SETTINGS_KEY = "healthlog.settings";
const VIEWS = ["home", "panels", "add", "scan", "test", "more"];
const VITALS = {
  bp: "bp",
  weight: "weights",
  glucose: "glucose",
  med: "meds",
  visit: "visits",
};

let settings = loadSettings();
let currentType = "report";
let openTestId = "";
let trendRange = "1y";
let renderToken = 0;
let toastTimer = 0;
let reportBuiltFor = null;

function loadSettings() {
  const defaults = profileFrom({});
  try {
    return profileFrom({ ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") });
  } catch {
    return defaults;
  }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

function showPatientName() {
  const node = document.getElementById("patient-name");
  const name = String(settings.patientName || "").trim();
  node.textContent = name;
  node.hidden = !name;
}

function applyTheme() {
  const theme = settings.theme === "light" || settings.theme === "dark"
    ? settings.theme
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  showPatientName();
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
  toastTimer = setTimeout(() => { node.hidden = true; }, 3600);
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
    const onKey = (event) => { if (event.key === "Escape") close("cancel"); };
    actions.forEach((action) => {
      const button = el("button", { type: "button", class: action.className, text: action.label, "data-testid": action.id });
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
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
}

function pill(view) {
  if (!view) return null;
  return el("span", { class: `pill ${view.level}`, text: view.title });
}

function profile() {
  return { sex: settings.sex, dob: settings.dob, cvRisk: settings.cvRisk };
}

function showView(name) {
  const view = VIEWS.includes(name) ? name : "home";
  document.querySelectorAll("[data-view]").forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll("[role=tab]").forEach((tab) => {
    const on = tab.dataset.tab === view || (view === "test" && tab.dataset.tab === "panels");
    tab.setAttribute("aria-selected", on ? "true" : "false");
  });
  const hash = view === "test" && openTestId ? `#test/${openTestId}` : `#${view}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  if (view === "home") renderHome();
  if (view === "panels") renderPanels();
  if (view === "test") renderTest();
  if (view === "add") {
    const patient = document.getElementById("report-patient");
    if (patient && !patient.value && settings.patientName) patient.value = settings.patientName;
    renderEntryList();
  }
  if (view === "more") syncSettingsForm();
}

function setAddType(type) {
  currentType = type;
  document.querySelectorAll(".type-grid [data-type]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.type === type ? "true" : "false");
  });
  document.querySelectorAll("#view-add form").forEach((form) => {
    form.hidden = form.dataset.form !== type;
  });
  if (type === "report") {
    buildReportForm().catch((err) => {
      const host = document.getElementById("report-fields");
      if (host) host.textContent = err && err.message ? err.message : "Could not list the screening tests.";
    });
    const patient = document.getElementById("report-patient");
    if (patient && !patient.value && settings.patientName) patient.value = settings.patientName;
  }
  renderEntryList();
}

function heightFor(record) {
  return record?.heightCm || settings.heightCm || null;
}

function glucoseUnit() {
  return settings.glucoseUnit === "mg/dL" ? "mg/dL" : "mmol/L";
}

function latestOf(records) {
  return byDateDesc(records)[0] || null;
}

async function renderHome() {
  const token = ++renderToken;
  const data = await dump();
  if (token !== renderToken) return;
  destroyCharts();
  const seek = document.getElementById("seek-slot");
  const hint = document.getElementById("hint-slot");
  const body = document.getElementById("home-body");
  seek.replaceChildren();
  hint.replaceChildren();
  body.replaceChildren();
  const tests = testsFor(data.customTests);
  const total = data.results.length + data.bp.length + data.weights.length + data.glucose.length + data.meds.length + data.visits.length;
  if (!settings.hintDismissed) {
    const card = el("article", { class: "card hint" }, [
      el("h2", { text: "Add HealthLog to your Home Screen" }),
      el("p", { text: "In Safari, tap Share, then Add to Home Screen. Records stay on this iPhone. Someone else who opens the link gets an empty tracker." }),
      el("button", { type: "button", class: "btn-secondary", text: "Hide this hint", "data-testid": "dismiss-hint" }),
    ]);
    card.querySelector("button").addEventListener("click", () => {
      settings.hintDismissed = true;
      saveSettings();
      renderHome();
    });
    hint.append(card);
  }
  if (!total) {
    body.append(el("article", { class: "card", "data-testid": "home-empty" }, [
      el("h2", { text: "No records yet" }),
      el("p", { text: "Add a screening report, scan a printed page, or open More to load fictional sample data." }),
    ]));
    return;
  }
  const alerts = [];
  const latestBp = latestOf(data.bp);
  const bpView = latestBp ? assessBp(latestBp) : null;
  if (bpView?.seekCare) alerts.push(`Blood pressure ${latestBp.systolic}/${latestBp.diastolic}. ${bpView.detail}`);
  const latestGlucose = latestOf(data.glucose);
  const glucoseView = latestGlucose ? assessGlucose(latestGlucose) : null;
  if (glucoseView?.seekCare) alerts.push(`Blood sugar ${formatGlucose(latestGlucose.mmol, glucoseUnit())} ${glucoseUnit()}. ${glucoseView.detail}`);
  const latestByTest = new Map();
  byDateAsc(data.results).forEach((row) => latestByTest.set(row.testId, row));
  latestByTest.forEach((row) => {
    const view = interpret(findTest(row.testId, tests), row, profile());
    if (view.seekCare) alerts.push(`${row.name || row.testId}: ${displayValue(row)}. ${view.guidance}`);
  });
  if (alerts.length) {
    const box = el("div", { class: "stack", "data-testid": "seek-care" });
    alerts.forEach((text) => box.append(el("div", { class: "seek" }, [
      el("strong", { text: "Seek medical care promptly" }),
      el("p", { text }),
    ])));
    seek.append(box);
  }
  const follow = data.followups.filter((item) => !item.done && item.date);
  if (follow.length) {
    const card = el("section", { class: "card", "data-testid": "followups" }, [el("h2", { text: "Follow-ups" })]);
    byDateAsc(follow).forEach((item) => {
      const test = findTest(item.testId, tests);
      const when = item.date < todayISO() ? "Overdue" : "Upcoming";
      card.append(el("p", { text: `${when} ${formatWhen(item.date)} · ${item.action}${test ? ` · ${test.name}` : ""}` }));
    });
    body.append(card);
  }
  const latestWrap = el("div", { class: "stack" }, [el("h2", { text: "Latest" })]);
  if (latestBp) {
    latestWrap.append(metricCard("home-bp", "Blood pressure", `${latestBp.systolic}/${latestBp.diastolic}`, `mmHg · ${formatWhen(latestBp.date)}`, bpView, trendNote(byDateAsc(data.bp).map((row) => row.systolic)), latestBp.sample));
  }
  if (latestGlucose) {
    latestWrap.append(metricCard("home-glucose", "Blood sugar", `${formatGlucose(latestGlucose.mmol, glucoseUnit())} ${glucoseUnit()}`, formatWhen(latestGlucose.date), glucoseView, trendNote(byDateAsc(data.glucose).map((row) => row.mmol)), latestGlucose.sample));
  }
  const latestWeight = latestOf(data.weights);
  if (latestWeight) {
    const bmiView = assessBmi(latestWeight.kg, heightFor(latestWeight));
    latestWrap.append(metricCard("home-weight", "Weight", `${latestWeight.kg} kg`, `${formatWhen(latestWeight.date)}${bmiView.bmi ? ` · BMI ${formatBmi(bmiView.bmi)}` : ""}`, bmiView, "", latestWeight.sample));
  }
  body.append(latestWrap);
  if (data.bp.length || data.weights.length || data.glucose.length) {
    const trends = el("details", { class: "panel", open: true }, [el("summary", { text: "Vitals over time" })]);
    const segment = el("div", { class: "segment", style: "margin:8px 0" });
    [["3m", "3m"], ["6m", "6m"], ["1y", "1y"], ["all", "All"]].forEach(([id, label]) => {
      const button = el("button", { type: "button", text: label, "data-vital-range": id, "aria-pressed": trendRange === id ? "true" : "false" });
      button.addEventListener("click", () => { trendRange = id; renderHome(); });
      segment.append(button);
    });
    trends.append(segment);
    const host = el("div", { class: "stack", id: "vital-charts" });
    trends.append(host);
    body.append(trends);
    mountVitalCharts(host, data);
  }
  const flagged = [];
  latestByTest.forEach((row) => {
    const view = interpret(findTest(row.testId, tests), row, profile());
    if (isFlagged(view.level)) flagged.push([row, view]);
  });
  if (flagged.length) {
    const section = el("section", { class: "stack", "data-testid": "flagged" }, [el("h2", { text: "About these flags" })]);
    flagged.slice(0, 8).forEach(([row, view]) => {
      section.append(el("article", { class: "card" }, [
        el("div", { class: "row-between" }, [el("h3", { text: row.name || row.testId }), pill(view)]),
        el("p", { class: "muted", text: `${displayValue(row)} · ${formatWhen(row.date)}` }),
        view.tierLabel ? el("p", { text: view.tierLabel }) : null,
        el("p", { class: "guidance", text: view.guidance }),
      ]));
    });
    body.append(section);
  }
}

function metricCard(testId, title, value, meta, view, note, sample) {
  return el("article", { class: "card", "data-testid": testId }, [
    el("div", { class: "row-between" }, [el("h3", { text: title }), pill(view)]),
    sample ? el("p", { class: "sample-tag", text: "Sample" }) : null,
    el("p", { class: "metric", text: value }),
    el("p", { class: "muted", text: meta }),
    view?.rangeLabel ? el("p", { class: "muted", text: view.rangeLabel }) : null,
    note ? el("p", { class: "trend-note", text: note }) : null,
  ]);
}

function mountVitalCharts(host, data) {
  const inRange = (row) => withinRange(row.date, trendRange);
  const add = (title, testId, labels, dataPoints, yTitle) => {
    if (!dataPoints.length) return;
    const canvas = el("canvas", { "data-testid": testId });
    const card = el("article", { class: "card" }, [el("h3", { text: title }), el("div", { class: "chart-box" }, [canvas])]);
    host.append(card);
    drawChart(canvas, {
      labels,
      yTitle,
      datasets: [{ label: title, data: dataPoints, borderColor: cssVar("--chart-1"), backgroundColor: cssVar("--chart-1") }],
    });
  };
  const bp = byDateAsc(data.bp.filter(inRange));
  if (bp.length) {
    const labels = bp.map((row) => chartLabel(row.date, bp.map((item) => item.date)));
    const canvas = el("canvas", { "data-testid": "chart-bp" });
    const card = el("article", { class: "card" }, [el("h3", { text: "Blood pressure" }), el("div", { class: "chart-box" }, [canvas])]);
    host.append(card);
    drawChart(canvas, {
      labels,
      yTitle: "mmHg",
      datasets: [
        { label: "Systolic", data: bp.map((row) => row.systolic), borderColor: cssVar("--chart-1"), backgroundColor: cssVar("--chart-1") },
        { label: "Diastolic", data: bp.map((row) => row.diastolic), borderColor: cssVar("--chart-2"), backgroundColor: cssVar("--chart-2") },
      ],
    });
  }
  const weights = byDateAsc(data.weights.filter(inRange));
  add("Weight", "chart-weight", weights.map((row) => chartLabel(row.date, weights.map((item) => item.date))), weights.map((row) => row.kg), "kg");
  const glucose = byDateAsc(data.glucose.filter(inRange));
  add("Blood sugar", "chart-glucose", glucose.map((row) => chartLabel(row.date, glucose.map((item) => item.date))), glucose.map((row) => glucoseUnit() === "mg/dL" ? row.mmol * GLUCOSE_FACTOR : row.mmol), glucoseUnit());
}

function sparkline(values) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 72 28");
  svg.setAttribute("class", "spark");
  svg.setAttribute("aria-hidden", "true");
  if (values.length < 2) return svg;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = 2 + (index / (values.length - 1)) * 68;
    const y = 26 - ((value - min) / span) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const line = document.createElementNS(svg.namespaceURI, "polyline");
  line.setAttribute("points", points);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  svg.append(line);
  return svg;
}

async function renderPanels() {
  const data = await dump();
  const tests = testsFor(data.customTests);
  const root = document.getElementById("panel-root");
  root.replaceChildren();
  const latestReport = latestOf(data.reports.map((report) => ({ ...report, date: report.dateCollected })));
  const tools = el("article", { class: "card stack" }, [el("h2", { text: "Screening checklist" })]);
  const select = el("select", { id: "checklist-report", "data-testid": "checklist-report" });
  select.append(el("option", { value: "", text: "Choose a report" }));
  byDateDesc(data.reports.map((report) => ({ ...report, date: report.dateCollected }))).forEach((report) => {
    const option = el("option", { value: report.id, text: `${report.patientName || "Unnamed"} · ${formatWhen(report.dateCollected)} · ${report.lab || "Report"}${report.sample ? " · Sample" : ""}` });
    if (latestReport && report.id === latestReport.id) option.selected = true;
    select.append(option);
  });
  const summary = el("p", { "data-testid": "checklist", text: "Save a screening report to see which tests were filled." });
  tools.append(select, summary);
  root.append(tools);
  const paintChecklist = () => {
    const report = data.reports.find((item) => item.id === select.value);
    if (!report) {
      summary.textContent = data.reports.length ? "Choose a report." : "Save a screening report to see which tests were filled.";
      return;
    }
    const ids = new Set(data.results.filter((row) => row.reportId === report.id).map((row) => row.testId));
    const filled = tests.filter((item) => ids.has(item.id));
    const missing = tests.filter((item) => item.panel !== "custom" && !ids.has(item.id));
    const who = report.patientName || settings.patientName || "Unnamed";
    summary.textContent = `${who}: ${filled.length} of ${tests.filter((item) => item.panel !== "custom").length} catalog tests on ${formatWhen(report.dateCollected)}.`;
    let nameLine = tools.querySelector("[data-testid=report-patient-label]");
    if (!nameLine) {
      nameLine = el("p", { "data-testid": "report-patient-label" });
      tools.insertBefore(nameLine, summary);
    }
    nameLine.textContent = report.patientName ? `Report for ${report.patientName}` : "This report has no patient name.";
    let list = tools.querySelector(".check-miss");
    if (!list) {
      list = el("p", { class: "check-miss" });
      tools.append(list);
    }
    list.textContent = missing.length ? `Not in this report: ${missing.slice(0, 8).map((item) => item.name).join(", ")}${missing.length > 8 ? "…" : ""}` : "Every catalog test has a result on this report.";
  };
  select.addEventListener("change", paintChecklist);
  paintChecklist();
  const byTest = new Map();
  data.results.forEach((row) => {
    if (!byTest.has(row.testId)) byTest.set(row.testId, []);
    byTest.get(row.testId).push(row);
  });
  PANELS.forEach(([id, label]) => {
    const group = tests.filter((item) => item.panel === id);
    if (!group.length) return;
    const any = group.some((item) => byTest.has(item.id));
    const details = el("details", { class: "panel", "data-testid": `panel-${id}`, open: any || id === "custom" });
    details.append(el("summary", { text: label }));
    group.forEach((item) => {
      const rows = byDateAsc(byTest.get(item.id) || []);
      const latest = rows[rows.length - 1];
      const view = latest ? interpret(item, latest, profile()) : null;
      const button = el("button", { type: "button", class: "test-row", "data-testid": `panel-test-${item.id}` });
      const copy = el("span", {}, [
        el("strong", { text: item.name }),
        el("span", { class: "muted", text: latest ? ` ${displayValue(latest)} · ${formatWhen(latest.date)}` : " No result yet" }),
      ]);
      button.append(copy);
      const side = el("span", { class: "row-between" });
      if (view) side.append(pill(view));
      side.append(sparkline(rows.map((row) => row.numeric).filter((value) => value != null)));
      button.append(side);
      button.addEventListener("click", () => {
        openTestId = item.id;
        showView("test");
      });
      details.append(button);
    });
    root.append(details);
  });
  const custom = el("article", { class: "card stack" }, [
    el("h2", { text: "Add a custom test" }),
    el("label", { class: "field" }, ["Name", el("input", { id: "custom-name", "data-testid": "custom-name", autocomplete: "off" })]),
    el("label", { class: "field" }, ["Unit", el("input", { id: "custom-unit", "data-testid": "custom-unit", placeholder: "mmol/L" })]),
    el("button", { type: "button", class: "btn-secondary", id: "save-custom", "data-testid": "save-custom", text: "Save custom test" }),
  ]);
  custom.querySelector("#save-custom").addEventListener("click", async () => {
    const name = custom.querySelector("#custom-name").value.trim();
    if (!name) return toast("Add a name for the custom test.");
    await put("customTests", {
      id: `custom-${newId()}`,
      name,
      aliases: [name],
      panel: "custom",
      unit: custom.querySelector("#custom-unit").value.trim(),
      resultType: "numeric",
      ref: null,
      about: "A test you added on this device.",
      sample: false,
    });
    toast("Custom test saved on this device.");
    renderPanels();
  });
  root.append(custom);
}

async function renderTest() {
  const data = await dump();
  destroyCharts();
  const tests = testsFor(data.customTests);
  const test = findTest(openTestId, tests);
  const root = document.getElementById("test-root");
  root.replaceChildren();
  if (!test) {
    root.append(el("p", { text: "That test is not on this device." }));
    return;
  }
  const rows = byDateAsc(data.results.filter((row) => row.testId === test.id));
  const latest = rows[rows.length - 1];
  const view = latest ? interpret(test, latest, profile()) : null;
  const report = latest ? data.reports.find((item) => item.id === latest.reportId) : null;
  root.append(el("article", { class: "card" }, [
    report?.patientName ? el("p", { "data-testid": "report-patient-label", text: `Report for ${report.patientName}` }) : null,
    el("h2", { text: test.name }),
    el("p", { text: test.about }),
    latest ? el("p", { class: "metric", text: displayValue(latest) }) : el("p", { class: "muted", text: "No result yet." }),
    view ? pill(view) : null,
    view?.tierLabel ? el("p", { "data-testid": "tier", text: view.tierLabel }) : el("p", { "data-testid": "tier", text: view?.rangeLabel || "" }),
    view?.guidance ? el("p", { class: "guidance", text: view.guidance }) : null,
  ]));
  const numbers = rows.filter((row) => row.numeric != null && !row.comparator);
  if (numbers.length >= 2) {
    const canvas = el("canvas", { "data-testid": "chart-lab" });
    const card = el("article", { class: "card" }, [el("h3", { text: "History" }), el("div", { class: "chart-box" }, [canvas])]);
    root.append(card);
    drawChart(canvas, {
      labels: numbers.map((row) => chartLabel(row.date, numbers.map((item) => item.date))),
      yTitle: test.unit,
      band: view?.band ? { ...view.band, color: bandColor() } : null,
      datasets: [{
        label: test.unit || "Value",
        data: numbers.map((row) => row.numeric),
        borderColor: cssVar("--chart-1"),
        backgroundColor: cssVar("--chart-1"),
      }],
    });
    const note = trendNote(numbers.map((row) => row.numeric));
    if (note) card.append(el("p", { class: "trend-note", text: note }));
  }
  if (rows.length) {
    const list = el("article", { class: "card" }, [el("h3", { text: "Saved results" })]);
    byDateDesc(rows).forEach((row) => {
      const line = el("div", { class: "entry" }, [
        el("strong", { text: displayValue(row) }),
        el("p", { class: "muted", text: formatWhen(row.date) }),
        el("button", { type: "button", text: "Delete", "data-id": row.id }),
      ]);
      line.querySelector("button").addEventListener("click", async () => {
        await remove("results", row.id);
        toast("Deleted from this device.");
        renderTest();
      });
      list.append(line);
    });
    root.append(list);
  }
  const follow = el("article", { class: "card stack" }, [
    el("h3", { text: "Follow-up" }),
    el("label", { class: "field" }, ["What to revisit", el("input", { id: "follow-action", "data-testid": "follow-action", placeholder: test.id === "hpylori" ? "For example: urea breath test" : "For example: repeat in 3–6 months" })]),
    el("label", { class: "field" }, ["Date", el("input", { id: "follow-date", "data-testid": "follow-date", type: "date" })]),
    el("button", { type: "button", class: "btn-primary", id: "save-follow", "data-testid": "save-follow", text: "Save follow-up" }),
  ]);
  follow.querySelector("#save-follow").addEventListener("click", async () => {
    const action = follow.querySelector("#follow-action").value.trim();
    const date = follow.querySelector("#follow-date").value;
    if (!action || !date) return toast("Add a follow-up note and a date.");
    await put("followups", stamp({
      id: newId(), testId: test.id, resultId: latest?.id || "", reportId: latest?.reportId || "", action, date, notes: "", done: false, sample: false,
    }));
    toast("Follow-up saved on this device.");
    showView("home");
  });
  root.append(follow);
}

function inputEl(testId, value = "") {
  const input = el("input", { "data-testid": testId, inputmode: "decimal", autocomplete: "off" });
  if (value) input.value = value;
  return input;
}

function reportRow(test) {
  const row = el("div", { class: "entry-line", "data-report-row": test.id });
  row.append(el("span", { class: "name", text: `${test.name}${test.unit ? ` · ${test.unit}` : ""}` }));
  if (test.resultType === "qualitative") {
    const select = el("select", { "data-testid": `qual-${test.id}` });
    select.style.gridColumn = "1 / -1";
    select.append(el("option", { value: "", text: "—" }));
    (QUAL_CHOICES[test.qualKind] || ["Negative", "Positive"]).forEach((choice) => select.append(el("option", { value: choice, text: choice })));
    row.append(select);
    return row;
  }
  if (test.resultType === "text") {
    const input = inputEl(`entry-${test.id}`);
    input.style.gridColumn = "1 / -1";
    row.append(input);
    return row;
  }
  const cmp = el("select", { "data-testid": `cmp-${test.id}` });
  ["", "<", "<=", ">", ">="].forEach((op) => cmp.append(el("option", { value: op, text: op || "=" })));
  row.append(cmp, inputEl(`entry-${test.id}`), el("span", { class: "muted", text: test.unit || "" }));
  if (test.secondary) row.append(el("span", { class: "muted", text: test.secondary.label }), inputEl(`secondary-${test.id}`));
  if (test.id === "glucose") {
    const specimen = el("select", { "data-testid": "entry-glucose-specimen" });
    [["", "Use report fasting"], ["fasting", "Fasting"], ["random", "Random"]].forEach(([value, label]) => specimen.append(el("option", { value, text: label })));
    row.append(specimen);
  }
  return row;
}

async function buildReportForm() {
  const custom = await list("customTests");
  const key = custom.map((item) => item.id).join(",");
  if (reportBuiltFor === key) return;
  reportBuiltFor = key;
  const host = document.getElementById("report-fields");
  host.replaceChildren();
  const tests = testsFor(custom);
  PANELS.forEach(([id, label]) => {
    const group = tests.filter((item) => item.panel === id);
    if (!group.length) return;
    const details = el("details", { class: "panel", open: true, "data-testid": `report-${id}` });
    details.append(el("summary", { text: label }));
    group.forEach((item) => details.append(reportRow(item)));
    host.append(details);
  });
  const date = document.getElementById("report-date");
  if (date && !date.value) date.value = todayISO();
  const patient = document.getElementById("report-patient");
  if (patient && !patient.value && settings.patientName) patient.value = settings.patientName;
}

function readReportRows(fasting) {
  const rows = [];
  document.querySelectorAll("[data-report-row]").forEach((row) => {
    const id = row.dataset.reportRow;
    const test = findTest(id) || { id, name: id, unit: "", resultType: "numeric" };
    const numeric = num(row.querySelector(`[data-testid="entry-${id}"]`)?.value);
    const qualitative = row.querySelector(`[data-testid="qual-${id}"]`)?.value || (test.resultType === "text" ? row.querySelector(`[data-testid="entry-${id}"]`)?.value.trim() : "");
    const secondary = num(row.querySelector(`[data-testid="secondary-${id}"]`)?.value);
    const comparator = row.querySelector(`[data-testid="cmp-${id}"]`)?.value || "";
    if (numeric == null && !qualitative && secondary == null) return;
    let specimen = "";
    if (id === "glucose") {
      specimen = row.querySelector("[data-testid=entry-glucose-specimen]")?.value || "";
      if (!specimen) specimen = fasting === "yes" ? "fasting" : fasting === "no" ? "random" : "";
    }
    rows.push({ test, numeric, qualitative, secondary, comparator, specimen });
  });
  return rows;
}

async function saveReport(form) {
  const date = form.dateCollected.value;
  if (!date) throw new Error("Add the date the sample was collected.");
  const fasting = form.fasting.value;
  const entered = readReportRows(fasting);
  if (!entered.length) throw new Error("Enter at least one result. Blank rows are skipped.");
  const report = stamp({
    id: newId(),
    dateCollected: date,
    patientName: form.patientName.value.trim() || settings.patientName || "",
    lab: form.lab.value.trim(),
    labNumber: form.labNumber.value.trim(),
    doctor: form.doctor.value.trim(),
    fasting: fasting === "yes" ? true : fasting === "no" ? false : null,
    notes: form.notes.value.trim(),
    sample: false,
  });
  const entries = [{ store: "reports", record: report }];
  entered.forEach((item) => {
    entries.push({ store: "results", record: stamp({
      id: newId(),
      testId: item.test.id,
      name: item.test.name,
      reportId: report.id,
      date,
      numeric: item.numeric,
      comparator: item.comparator,
      qualitative: item.qualitative || "",
      unit: item.test.unit || "",
      secondaryNumeric: item.secondary,
      secondaryUnit: item.secondary != null ? (item.test.secondary?.unit || "") : "",
      specimen: item.specimen,
      refLow: null,
      refHigh: null,
      lowInclusive: true,
      highInclusive: true,
      refText: "",
      flag: "",
      notes: "",
      sample: false,
    }) });
  });
  await putMany(entries);
  form.reset();
  reportBuiltFor = null;
  await buildReportForm();
  toast(`Saved ${entered.length} results on this device.`);
  showView("panels");
}

async function renderEntryList() {
  const host = document.getElementById("entry-list");
  if (!host || currentType === "report") {
    if (host) host.replaceChildren(el("p", { class: "muted", text: currentType === "report" ? "Saved screening reports appear under Panels." : "" }));
    return;
  }
  const rows = byDateDesc(await list(VITALS[currentType]));
  host.replaceChildren();
  if (!rows.length) {
    host.append(el("p", { class: "muted", text: "Nothing saved here yet." }));
    return;
  }
  rows.forEach((row) => {
    let title = "";
    if (currentType === "bp") title = `${row.systolic}/${row.diastolic}`;
    else if (currentType === "weight") title = `${row.kg} kg`;
    else if (currentType === "glucose") title = `${formatGlucose(row.mmol, glucoseUnit())} ${glucoseUnit()}`;
    else if (currentType === "med") title = row.name;
    else title = row.doctor || row.reason || "Visit";
    const item = el("article", { class: "entry" }, [
      el("strong", { text: title }),
      el("p", { class: "muted", text: formatWhen(row.date || row.start) }),
      el("div", { class: "entry-actions" }, [
        el("button", { type: "button", text: "Edit", "data-action": "edit", "data-id": row.id }),
        el("button", { type: "button", text: "Delete", "data-action": "delete", "data-id": row.id }),
      ]),
    ]);
    host.append(item);
  });
}

function setEditing(form, on) {
  const button = form.querySelector("[type=submit]");
  if (button?.dataset.label) button.textContent = on ? "Update" : button.dataset.label;
  const cancel = form.querySelector("[data-cancel-edit]");
  if (cancel) cancel.hidden = !on;
}

function resetVital(form) {
  form.reset();
  delete form.dataset.editing;
  setEditing(form, false);
  setFormError(form, "");
  const date = form.querySelector('input[type="date"], input[type="datetime-local"]');
  if (date) date.value = date.type === "date" ? todayISO() : nowLocalInput();
  if (form.dataset.form === "glucose") {
    const unit = form.querySelector('[name="unit"]');
    unit.value = glucoseUnit();
    unit.dataset.prev = unit.value;
  }
  if (form.dataset.form === "weight" && settings.heightCm) form.heightCm.value = settings.heightCm;
}

async function saveVital(form) {
  const type = form.dataset.form;
  const store = VITALS[type];
  const existing = form.dataset.editing ? (await list(store)).find((row) => row.id === form.dataset.editing) : null;
  let record;
  if (type === "bp") {
    const systolic = num(form.systolic.value);
    const diastolic = num(form.diastolic.value);
    const pulse = num(form.pulse.value);
    if (systolic == null || diastolic == null) throw new Error("Add systolic and diastolic numbers.");
    if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 180) throw new Error("Check those blood pressure numbers.");
    if (systolic < diastolic) throw new Error("Systolic is usually higher than diastolic.");
    record = { id: existing?.id || newId(), systolic, diastolic, pulse, date: form.date.value, notes: form.notes.value.trim(), sample: existing?.sample || false };
  } else if (type === "weight") {
    const kg = num(form.kg.value);
    const heightCm = num(form.heightCm.value);
    if (kg == null || kg < 2 || kg > 400) throw new Error("Enter a weight in kilograms.");
    if (heightCm != null) { settings.heightCm = heightCm; saveSettings(); }
    record = { id: existing?.id || newId(), kg, heightCm, date: form.date.value, notes: form.notes.value.trim(), sample: existing?.sample || false };
  } else if (type === "glucose") {
    const mmol = glucoseToMmol(form.value.value, form.unit.value);
    if (mmol == null || mmol < 0.2 || mmol > 55) throw new Error("Check the blood sugar number.");
    record = { id: existing?.id || newId(), mmol, context: form.context.value, date: form.date.value, notes: form.notes.value.trim(), sample: existing?.sample || false };
  } else if (type === "med") {
    if (!form.name.value.trim()) throw new Error("Add the medication name.");
    record = { id: existing?.id || newId(), name: form.name.value.trim(), dose: form.dose.value.trim(), frequency: form.frequency.value.trim(), start: form.start.value, end: form.end.value, notes: form.notes.value.trim(), sample: existing?.sample || false };
  } else {
    if (!form.date.value) throw new Error("Add the visit date.");
    record = { id: existing?.id || newId(), date: form.date.value, doctor: form.doctor.value.trim(), reason: form.reason.value.trim(), notes: form.notes.value.trim(), followUp: form.followUp.value, sample: existing?.sample || false };
  }
  await put(store, stamp(record, existing));
  resetVital(form);
  await renderEntryList();
  toast("Saved on this device.");
}

function optionGroups(select, tests, selected) {
  select.append(el("option", { value: "", text: "Not in the catalog" }));
  PANELS.forEach(([id, label]) => {
    const group = tests.filter((item) => item.panel === id);
    if (!group.length) return;
    const opt = el("optgroup", { label });
    group.forEach((item) => opt.append(el("option", { value: item.id, text: item.name })));
    select.append(opt);
  });
  select.value = selected || "";
}

function reviewRowElement(row, tests) {
  const matched = matchTest(row.testName, tests);
  const card = el("div", { class: "review-row", "data-testid": "review-row" });
  const name = el("input", { "data-testid": "row-name", value: row.testName || "" });
  const select = el("select", { "data-testid": "row-test" });
  optionGroups(select, tests, matched?.id || "");
  const cmp = el("select", { "data-testid": "row-cmp" });
  ["", "<", "<=", ">", ">="].forEach((op) => {
    const option = el("option", { value: op, text: op || "=" });
    if (op === (row.comparator || "")) option.selected = true;
    cmp.append(option);
  });
  const value = el("input", { "data-testid": "row-value", inputmode: "decimal", value: row.value ?? "" });
  const unit = el("input", { "data-testid": "row-unit", value: row.unit || matched?.unit || "" });
  const qual = el("input", { "data-testid": "row-qual", placeholder: "Negative, Clear…", value: row.qualitative || "" });
  const secondary = el("input", { "data-testid": "row-secondary", inputmode: "decimal", value: row.secondary ?? "" });
  const low = el("input", { "data-testid": "row-low", inputmode: "decimal", value: row.refLow ?? "" });
  const high = el("input", { "data-testid": "row-high", inputmode: "decimal", value: row.refHigh ?? "" });
  const preview = el("p", { class: "muted span-2", "data-testid": "row-preview" });
  const refresh = () => {
    const test = findTest(select.value, tests);
    const draft = {
      numeric: num(value.value),
      comparator: cmp.value,
      qualitative: qual.value.trim(),
      unit: unit.value.trim(),
      refLow: num(low.value),
      refHigh: num(high.value),
      date: document.getElementById("review-date").value,
      specimen: specimenFromName(name.value),
    };
    const view = interpret(test, draft, profile());
    preview.textContent = test ? `${test.name}. ${view.title}. ${view.tierLabel || view.rangeLabel}` : "Pick a catalog test, or save this row as a custom test.";
  };
  card.addEventListener("input", refresh);
  card.addEventListener("change", refresh);
  card.append(
    el("label", { class: "field span-2" }, ["Printed name", name]),
    el("label", { class: "field span-2" }, ["Catalog test", select]),
    el("label", { class: "field" }, ["Compare", cmp]),
    el("label", { class: "field" }, ["Value", value]),
    el("label", { class: "field" }, ["Unit", unit]),
    el("label", { class: "field" }, ["Qualitative", qual]),
    el("label", { class: "field" }, ["Percent or IFCC", secondary]),
    el("label", { class: "field" }, ["Ref low", low]),
    el("label", { class: "field" }, ["Ref high", high]),
    el("button", { type: "button", class: "btn-secondary", text: "Remove row", "data-testid": "remove-row" }),
    preview,
  );
  card.querySelector("[data-testid=remove-row]").addEventListener("click", () => card.remove());
  refresh();
  return card;
}

async function openReview(text) {
  const parsed = parseLabReport(text);
  document.getElementById("ocr-raw").textContent = text || "";
  const date = document.getElementById("review-date");
  const lab = document.getElementById("review-lab");
  if (parsed.suggestedDate) date.value = parsed.suggestedDate;
  else if (!date.value) date.value = todayISO();
  if (parsed.suggestedLab) lab.value = parsed.suggestedLab;
  const patient = document.getElementById("review-patient");
  if (patient && !patient.value && settings.patientName) patient.value = settings.patientName;
  const tests = testsFor(await list("customTests"));
  const host = document.getElementById("review-rows");
  host.replaceChildren();
  (parsed.rows.length ? parsed.rows : [{ testName: "", value: "", unit: "" }]).forEach((row) => host.append(reviewRowElement(row, tests)));
  document.getElementById("review-empty").hidden = parsed.rows.length > 0;
  const review = document.getElementById("review");
  review.hidden = false;
  review.scrollIntoView({ block: "start" });
}

async function saveReview() {
  const date = document.getElementById("review-date").value;
  if (!date) throw new Error("Add the date collected before saving.");
  const tests = testsFor(await list("customTests"));
  const fasting = document.getElementById("review-fasting").value;
  const report = stamp({
    id: newId(),
    dateCollected: date,
    patientName: document.getElementById("review-patient").value.trim() || settings.patientName || "",
    lab: document.getElementById("review-lab").value.trim(),
    labNumber: document.getElementById("review-number").value.trim(),
    doctor: document.getElementById("review-doctor").value.trim(),
    fasting: fasting === "yes" ? true : fasting === "no" ? false : null,
    notes: "",
    sample: false,
  });
  const entries = [{ store: "reports", record: report }];
  const cards = [...document.querySelectorAll("[data-testid=review-row]")];
  for (const card of cards) {
    const printed = card.querySelector("[data-testid=row-name]").value.trim();
    const numeric = num(card.querySelector("[data-testid=row-value]").value);
    const qualitative = card.querySelector("[data-testid=row-qual]").value.trim();
    const secondary = num(card.querySelector("[data-testid=row-secondary]").value);
    if (!printed && numeric == null && !qualitative) continue;
    if (numeric == null && !qualitative) throw new Error(`“${printed || "A row"}” needs a value. Nothing new was saved.`);
    let testId = card.querySelector("[data-testid=row-test]").value;
    let test = findTest(testId, tests);
    if (!testId) {
      testId = `custom-${newId()}`;
      const custom = {
        id: testId, name: printed || "Custom test", aliases: printed ? [printed] : [], panel: "custom", unit: card.querySelector("[data-testid=row-unit]").value.trim(), resultType: qualitative && numeric == null ? "qualitative" : "numeric", ref: null, about: "Added from a scanned report on this device.", sample: false,
      };
      entries.push({ store: "customTests", record: custom });
      test = custom;
    }
    const low = num(card.querySelector("[data-testid=row-low]").value);
    const high = num(card.querySelector("[data-testid=row-high]").value);
    entries.push({ store: "results", record: stamp({
      id: newId(),
      testId,
      name: test?.name || printed,
      reportId: report.id,
      date,
      numeric,
      comparator: card.querySelector("[data-testid=row-cmp]").value,
      qualitative,
      unit: card.querySelector("[data-testid=row-unit]").value.trim() || test?.unit || "",
      secondaryNumeric: secondary,
      secondaryUnit: secondary != null ? (test?.secondary?.unit || "%") : "",
      specimen: testId === "glucose" ? (specimenFromName(printed) || (fasting === "yes" ? "fasting" : fasting === "no" ? "random" : "")) : "",
      refLow: low,
      refHigh: high,
      lowInclusive: true,
      highInclusive: true,
      refText: [low, high].every((item) => item == null) ? "" : `${low ?? ""} - ${high ?? ""}`.replace(" - ", low == null ? "" : " - "),
      flag: "",
      notes: "",
      sample: false,
    }) });
  }
  if (entries.length < 2) throw new Error("Add at least one result before saving.");
  await putMany(entries);
  document.getElementById("review").hidden = true;
  document.getElementById("review-rows").replaceChildren();
  toast("Saved the reviewed report on this device.");
  showView("panels");
}

function friendlyStatus(status) {
  const text = String(status || "").toLowerCase();
  if (text.includes("prepar")) return "Preparing the photo…";
  if (text.includes("core")) return "Preparing the on-device reader…";
  if (text.includes("language") || text.includes("trained")) return "Loading English text recognition…";
  if (text.includes("recogn")) return "Reading the photo…";
  return "Working…";
}

async function onImage(file) {
  if (!file) return;
  const error = document.getElementById("ocr-error");
  error.hidden = true;
  const wrap = document.getElementById("ocr-progress");
  wrap.hidden = false;
  try {
    const text = await recognizeImage(file, (message) => {
      wrap.querySelector("[data-testid=progress-label]").textContent = friendlyStatus(message.status);
      wrap.querySelector("[data-testid=progress-bar]").style.width = `${Math.round((Number(message.progress) || 0) * 100)}%`;
    });
    wrap.hidden = true;
    await openReview(text);
  } catch (err) {
    wrap.hidden = true;
    error.hidden = false;
    error.textContent = `${err.message || "The photo could not be read."} Nothing was saved.`;
  }
}

function syncSettingsForm() {
  document.getElementById("set-name").value = settings.patientName || "";
  document.getElementById("set-theme").value = settings.theme;
  document.getElementById("set-glucose-unit").value = glucoseUnit();
  document.getElementById("set-height").value = settings.heightCm || "";
  document.getElementById("set-sex").value = settings.sex || "";
  document.getElementById("set-dob").value = settings.dob || "";
  document.getElementById("set-cvrisk").value = settings.cvRisk || "";
}

async function exportJson() {
  const payload = buildBackup(await dump(), settings);
  const result = await saveFile(`healthlog-backup-${todayISO()}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  if (result === "downloaded") toast("Backup downloaded. On iPhone, keep it in Files.");
  if (result === "shared") toast("Backup opened in the share sheet.");
}

async function importFile(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch {
    await openModal({ title: "Could not read that file", body: "Choose a HealthLog JSON backup.", actions: [{ id: "modal-ok", label: "OK", value: "ok", className: "btn-primary" }] });
    return;
  }
  const result = validateBackup(parsed);
  if (!result.ok) {
    await openModal({ title: "Backup not imported", body: result.errors.join("\n"), actions: [{ id: "modal-ok", label: "OK", value: "ok", className: "btn-primary" }] });
    return;
  }
  const choice = await openModal({
    title: "Import backup",
    body: `This file has ${countRecords(result.counts)} records. Merge keeps what is already on this device. Replace deletes everything on this device first.`,
    actions: [
      { id: "modal-merge", label: "Merge", value: "merge", className: "btn-primary" },
      { id: "modal-replace", label: "Replace", value: "replace", className: "btn-danger" },
      { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
    ],
  });
  if (choice !== "merge" && choice !== "replace") return;
  await writeAll(result.data, choice);
  const rawProfile = parsed.version === 2 ? parsed.data.profile : parsed.data.settings;
  if (rawProfile && typeof rawProfile === "object") {
    settings = { ...settings, ...result.settings };
    saveSettings();
    applyTheme();
  }
  reportBuiltFor = null;
  toast(choice === "replace" ? "This device now matches the backup." : "Backup merged on this device.");
  showView("home");
}

function bind() {
  document.querySelector(".tabbar").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) showView(tab.dataset.tab);
  });
  window.addEventListener("hashchange", () => {
    const hash = location.hash.slice(1);
    if (hash.startsWith("test/")) {
      openTestId = hash.slice(5);
      showView("test");
    } else showView(hash);
  });
  document.getElementById("test-back").addEventListener("click", () => showView("panels"));
  document.querySelector(".type-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (button) setAddType(button.dataset.type);
  });
  document.getElementById("view-add").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    setFormError(form, "");
    try {
      if (form.dataset.form === "report") await saveReport(form);
      else await saveVital(form);
    } catch (err) {
      setFormError(form, err.message || "Could not save.");
    }
  });
  document.querySelectorAll("[data-cancel-edit]").forEach((button) => {
    button.addEventListener("click", () => resetVital(button.form));
  });
  document.getElementById("entry-list").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !VITALS[currentType]) return;
    const rows = await list(VITALS[currentType]);
    const row = rows.find((item) => item.id === button.dataset.id);
    if (!row) return;
    const form = document.querySelector(`form[data-form="${currentType}"]`);
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
      await remove(VITALS[currentType], row.id);
      await renderEntryList();
      return;
    }
    form.dataset.editing = row.id;
    setEditing(form, true);
    if (currentType === "bp") {
      form.systolic.value = row.systolic;
      form.diastolic.value = row.diastolic;
      form.pulse.value = row.pulse ?? "";
      form.date.value = String(row.date).length === 10 ? `${row.date}T00:00` : row.date;
      form.notes.value = row.notes || "";
    } else if (currentType === "weight") {
      form.kg.value = row.kg;
      form.heightCm.value = row.heightCm ?? "";
      form.date.value = String(row.date).length === 10 ? `${row.date}T00:00` : row.date;
    } else if (currentType === "glucose") {
      form.unit.value = glucoseUnit();
      form.unit.dataset.prev = form.unit.value;
      form.value.value = formatGlucose(row.mmol, glucoseUnit());
      form.context.value = row.context;
      form.date.value = String(row.date).length === 10 ? `${row.date}T00:00` : row.date;
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
  });
  const glucoseUnitSelect = document.querySelector('#form-glucose [name="unit"]');
  glucoseUnitSelect.addEventListener("change", () => {
    const previous = glucoseUnitSelect.dataset.prev || "mmol/L";
    const mmol = glucoseToMmol(document.querySelector('#form-glucose [name="value"]').value, previous);
    if (mmol != null) document.querySelector('#form-glucose [name="value"]').value = formatGlucose(mmol, glucoseUnitSelect.value);
    glucoseUnitSelect.dataset.prev = glucoseUnitSelect.value;
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
  });
  document.getElementById("parse-paste").addEventListener("click", () => {
    const text = document.getElementById("paste-text").value;
    if (!text.trim()) {
      document.getElementById("ocr-error").hidden = false;
      document.getElementById("ocr-error").textContent = "Paste the report text first. Nothing was saved.";
      return;
    }
    openReview(text);
  });
  document.getElementById("add-row").addEventListener("click", async () => {
    const tests = testsFor(await list("customTests"));
    document.getElementById("review-rows").append(reviewRowElement({ testName: "", value: "", unit: "" }, tests));
  });
  document.getElementById("save-review").addEventListener("click", () => {
    saveReview().catch((err) => {
      const node = document.getElementById("ocr-error");
      node.hidden = false;
      node.textContent = err.message || "Could not save.";
    });
  });
  document.getElementById("set-name").addEventListener("change", (event) => {
    settings.patientName = event.target.value.trim();
    saveSettings();
    showPatientName();
  });
  ["set-theme", "set-glucose-unit", "set-sex", "set-cvrisk"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (event) => {
      const key = { "set-theme": "theme", "set-glucose-unit": "glucoseUnit", "set-sex": "sex", "set-cvrisk": "cvRisk" }[id];
      settings[key] = event.target.value;
      saveSettings();
      if (key === "theme") applyTheme();
      toast("Saved on this device.");
    });
  });
  document.getElementById("set-dob").addEventListener("change", (event) => {
    settings.dob = event.target.value;
    saveSettings();
  });
  document.getElementById("set-height").addEventListener("change", (event) => {
    const value = num(event.target.value);
    if (event.target.value && (value == null || value < 50 || value > 260)) {
      toast("Enter height in centimetres.");
      event.target.value = settings.heightCm || "";
      return;
    }
    settings.heightCm = value || "";
    saveSettings();
  });
  document.getElementById("export-json").addEventListener("click", () => exportJson().catch(() => toast("Could not export.")));
  document.getElementById("export-csv").addEventListener("click", async () => {
    const result = await saveFile(`healthlog-readings-${todayISO()}.csv`, new Blob([toCsv(await dump())], { type: "text/csv" }));
    if (result !== "cancelled") toast("CSV ready.");
  });
  document.getElementById("import-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) importFile(file).catch(() => toast("Could not import that file."));
  });
  document.getElementById("load-sample").addEventListener("click", async () => {
    const choice = await openModal({
      title: "Load fictional sample data?",
      body: "This adds a labelled SAMPLE screening panel so you can try the layout. It is not a real person. Existing sample rows are replaced.",
      actions: [
        { id: "modal-cancel", label: "Cancel", value: "cancel", className: "btn-secondary" },
        { id: "modal-confirm", label: "Load sample data", value: "confirm", className: "btn-primary" },
      ],
    });
    if (choice !== "confirm") return;
    await removeSample();
    await writeAll(buildSample(), "merge");
    toast("Fictional sample data was added on this device.");
    showView("panels");
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
      body: `This removes ${count} records from this device. Theme and profile settings stay. Export a backup first if you might want them back.`,
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

function startEditFromList() { /* edit is handled in the entry-list click listener */ }

async function init() {
  applyTheme();
  bind();
  document.querySelectorAll('#view-add form[data-form="bp"], #view-add form[data-form="weight"], #view-add form[data-form="glucose"], #view-add form[data-form="med"], #view-add form[data-form="visit"]').forEach(resetVital);
  setAddType("report");
  const hash = location.hash.slice(1);
  if (hash.startsWith("test/")) {
    openTestId = hash.slice(5);
    showView("test");
  } else showView(VIEWS.includes(hash) ? hash : "home");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
}

init();
void startEditFromList;
void parseRange;
void panelLabel;
void CATALOG;
