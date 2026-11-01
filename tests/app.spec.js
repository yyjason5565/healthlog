import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = "/opt/cursor/artifacts";
const leaks = new WeakMap();

function stamp(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const z = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
  return { day, time: `${day}T09:00` };
}

async function noOverflow(page) {
  const box = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: document.documentElement.clientWidth,
  }));
  expect(box.scroll).toBeLessThanOrEqual(box.inner + 1);
}

async function labCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("healthlog");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction("labs", "readonly").objectStore("labs").count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  }));
}

async function reviewRow(page, name) {
  const rows = page.locator("[data-testid=review-row]");
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    const value = await row.locator("[data-testid=row-name]").inputValue();
    if (value.toLowerCase() === name.toLowerCase()) return row;
  }
  const names = [];
  for (let i = 0; i < count; i += 1) names.push(await rows.nth(i).locator("[data-testid=row-name]").inputValue());
  throw new Error(`No review row named ${name}. Saw: ${names.join(" | ")}`);
}

test.beforeEach(async ({ page }) => {
  const found = [];
  leaks.set(page, found);
  page.on("request", (req) => {
    const url = req.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") found.push(url);
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "HealthLog", exact: true })).toBeVisible();
  await expect(page.getByTestId("home-empty").or(page.getByTestId("home-bp"))).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(leaks.get(page) || [], (leaks.get(page) || []).join("\n")).toEqual([]);
});

test("loads under /healthlog with privacy, manifest, and no sideways scroll", async ({ page }) => {
  await expect(page.getByTestId("disclaimer")).toContainText("Not medical advice");
  await expect(page.locator('link[rel="stylesheet"]')).toHaveAttribute("href", "css/app.css");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black-translucent");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "icons/apple-touch-icon.png");
  const manifest = await (await page.request.get("./manifest.json")).json();
  expect(manifest.name).toBe("HealthLog");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  await page.getByTestId("tab-more").click();
  await expect(page.getByTestId("privacy-note")).toContainText("IndexedDB");
  await expect(page.getByTestId("privacy-note")).toContainText("Clearing Safari");
  await expect(page.getByTestId("homescreen-help")).toContainText("Add to Home Screen");
  await expect(page.getByTestId("full-disclaimer")).toContainText("does not diagnose");
  for (const tab of ["home", "add", "scan", "trends", "more"]) {
    await page.getByTestId(`tab-${tab}`).click();
    await noOverflow(page);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration()));
});

test("saves readings, flags them, and charts trends", async ({ page }) => {
  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood pressure", exact: true }).click();
  const bp = page.getByTestId("form-bp");
  for (const [days, sys, dia] of [[20, 120, 78], [10, 128, 82], [1, 136, 88]]) {
    await bp.getByTestId("bp-sys").fill(String(sys));
    await bp.getByTestId("bp-dia").fill(String(dia));
    await bp.getByTestId("bp-pulse").fill("70");
    await bp.getByTestId("bp-date").fill(stamp(days).time);
    await bp.getByTestId("save-bp").click();
    await expect(page.getByTestId("toast")).toContainText("Saved");
  }
  await expect(page.getByTestId("entry-list")).toContainText("136/88");

  await page.getByRole("button", { name: "Weight", exact: true }).click();
  const weight = page.getByTestId("form-weight");
  await weight.getByTestId("weight-kg").fill("70");
  await weight.getByTestId("weight-height").fill("170");
  await weight.locator('input[name="date"]').fill(stamp(1).time);
  await weight.getByTestId("save-weight").click();

  await page.getByRole("button", { name: "Blood sugar", exact: true }).click();
  const glucose = page.getByTestId("form-glucose");
  await glucose.getByTestId("glucose-value").fill("5.4");
  await glucose.getByTestId("glucose-context").selectOption("fasting");
  await glucose.locator('input[name="date"]').fill(stamp(1).time);
  await glucose.getByTestId("save-glucose").click();

  await page.getByRole("button", { name: "Lab result", exact: true }).click();
  const lab = page.getByTestId("form-lab");
  await lab.locator('input[name="testName"]').fill("LDL cholesterol");
  await lab.locator('input[name="value"]').fill("3.8");
  await lab.locator('input[name="unit"]').fill("mmol/L");
  await lab.locator('input[name="refPrinted"]').fill("< 3.4");
  await lab.locator('input[name="date"]').fill(stamp(2).day);
  await lab.getByTestId("save-lab").click();

  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("home-bp")).toContainText("136/88");
  await expect(page.getByTestId("home-bp")).toContainText("Rising over the last 3 results");
  await expect(page.getByTestId("home-weight")).toContainText("24.2");
  await expect(page.getByTestId("home-glucose")).toContainText("5.4 mmol/L");
  await expect(page.getByTestId("home-labs")).toContainText("LDL cholesterol");
  await expect(page.getByTestId("flagged")).toContainText("Above the report range");
  await expect(page.getByTestId("flagged")).toContainText("doctor");
  await expect(page.getByTestId("seek-care")).toHaveCount(0);

  await page.getByTestId("tab-trends").click();
  await expect(page.getByTestId("chart-bp")).toBeVisible();
  await expect(page.getByTestId("chart-weight")).toBeVisible();
  await expect(page.getByTestId("chart-glucose")).toBeVisible();
  await page.getByTestId("range-3m").click();
  await expect(page.getByTestId("chart-bp")).toBeVisible();
  await page.getByTestId("range-all").click();
  await expect(page.getByTestId("chart-glucose")).toBeVisible();
  await noOverflow(page);

  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood pressure", exact: true }).click();
  await page.getByTestId("entry-list").getByRole("button", { name: "Edit" }).first().click();
  await page.getByTestId("bp-sys").fill("122");
  await page.getByTestId("save-bp").click();
  await expect(page.getByTestId("entry-list")).toContainText("122/88");
  await page.getByTestId("entry-list").getByRole("button", { name: "Delete" }).first().click();
  await page.getByTestId("modal-confirm").click();
  await expect(page.getByTestId("entry-list")).not.toContainText("122/88");
});

test("asks for prompt care when a reading is dangerous", async ({ page }) => {
  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood pressure", exact: true }).click();
  const bp = page.getByTestId("form-bp");
  await bp.getByTestId("bp-sys").fill("190");
  await bp.getByTestId("bp-dia").fill("110");
  await bp.getByTestId("bp-date").fill(stamp(0).time);
  await bp.getByTestId("save-bp").click();
  await page.getByRole("button", { name: "Blood sugar", exact: true }).click();
  const glucose = page.getByTestId("form-glucose");
  await glucose.getByTestId("glucose-value").fill("2.5");
  await glucose.getByTestId("glucose-context").selectOption("random");
  await glucose.locator('input[name="date"]').fill(stamp(0).time);
  await glucose.getByTestId("save-glucose").click();
  await page.getByTestId("tab-home").click();
  const seek = page.getByTestId("seek-care");
  await expect(seek).toContainText("Seek medical care promptly");
  await expect(seek).toContainText("190/110");
  await expect(seek).toContainText("2.5");
  await expect(seek).toContainText("999");
});

test("converts mg/dL blood sugar for display", async ({ page }) => {
  await page.getByTestId("tab-more").click();
  await page.getByTestId("set-glucose-unit").selectOption("mg/dL");
  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood sugar", exact: true }).click();
  const form = page.getByTestId("form-glucose");
  await expect(form.getByTestId("glucose-unit")).toHaveValue("mg/dL");
  await form.getByTestId("glucose-value").fill("90");
  await form.getByTestId("glucose-context").selectOption("fasting");
  await form.locator('input[name="date"]').fill(stamp(0).time);
  await form.getByTestId("save-glucose").click();
  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("home-glucose")).toContainText("90 mg/dL");
  await page.getByTestId("tab-more").click();
  await page.getByTestId("set-glucose-unit").selectOption("mmol/L");
  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("home-glucose")).toContainText("5.0 mmol/L");
});

test("exports, merges, replaces, and deletes backups", async ({ page }) => {
  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood pressure", exact: true }).click();
  const bp = page.getByTestId("form-bp");
  await bp.getByTestId("bp-sys").fill("118");
  await bp.getByTestId("bp-dia").fill("76");
  await bp.getByTestId("bp-date").fill(stamp(0).time);
  await bp.getByTestId("save-bp").click();

  await page.getByTestId("tab-more").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^healthlog-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = path.join("/tmp", download.suggestedFilename());
  await download.saveAs(file);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(payload.app).toBe("HealthLog");
  expect(payload.data.bp[0].systolic).toBe(118);

  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood sugar", exact: true }).click();
  const glucose = page.getByTestId("form-glucose");
  await glucose.getByTestId("glucose-value").fill("9");
  await glucose.getByTestId("glucose-context").selectOption("fasting");
  await glucose.locator('input[name="date"]').fill(stamp(0).time);
  await glucose.getByTestId("save-glucose").click();

  await page.getByTestId("tab-more").click();
  await page.getByTestId("import-file").setInputFiles(file);
  await page.getByTestId("modal-merge").click();
  await expect(page.getByTestId("home-bp")).toContainText("118/76");
  await expect(page.getByTestId("home-glucose")).toContainText("9.0");

  await page.getByTestId("tab-more").click();
  await page.getByTestId("import-file").setInputFiles(file);
  await page.getByTestId("modal-replace").click();
  await expect(page.getByTestId("home-bp")).toContainText("118/76");
  await expect(page.getByTestId("home-glucose")).toHaveCount(0);

  const csvPromise = page.waitForEvent("download");
  await page.getByTestId("tab-more").click();
  await page.getByTestId("export-csv").click();
  expect((await csvPromise).suggestedFilename()).toMatch(/\.csv$/);

  await page.getByTestId("import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":1}'),
  });
  await expect(page.getByTestId("modal-body")).toContainText("not a HealthLog backup");
  await page.getByTestId("modal-ok").click();

  await page.getByTestId("delete-all").click();
  await page.getByTestId("modal-confirm").click();
  await expect(page.getByTestId("home-empty")).toBeVisible();
});

test("reviews pasted results and does not save until asked", async ({ page }) => {
  await page.getByTestId("tab-scan").click();
  await page.getByTestId("show-paste").click();
  await page.getByTestId("paste-text").fill("HbA1c 6.2 % < 5.7 H\nLDL Cholesterol 3.8 mmol/L < 3.4 H\n");
  await page.getByTestId("parse-paste").click();
  await expect(page.getByTestId("review")).toBeVisible();
  const hba = await reviewRow(page, "HbA1c");
  await expect(hba.locator("[data-testid=row-value]")).toHaveValue("6.2");
  await expect(hba.locator("[data-testid=row-high]")).toHaveValue("5.7");
  await expect(hba.locator("[data-testid=row-flag]")).toHaveValue("H");
  const ldl = await reviewRow(page, "LDL Cholesterol");
  await expect(ldl.locator("[data-testid=row-value]")).toHaveValue("3.8");
  await expect(ldl.locator("[data-testid=row-high]")).toHaveValue("3.4");
  expect(await labCount(page)).toBe(0);
  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("home-empty")).toBeVisible();
  await page.getByTestId("tab-scan").click();
  await page.getByTestId("save-review").click();
  await expect(page.getByTestId("home-labs")).toContainText("HbA1c");
  await expect(page.getByTestId("home-labs")).toContainText("6.2");
});

test("reads a fictional lab photo on the device", async ({ page }) => {
  await page.getByTestId("tab-scan").click();
  await page.getByTestId("scan-file").setInputFiles(path.join(root, "tests/fixtures/lab-report.png"));
  await expect(page.getByTestId("ocr-progress")).toBeVisible();
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 150000 });
  const hb = await reviewRow(page, "Haemoglobin");
  await expect(hb.locator("[data-testid=row-value]")).toHaveValue("138");
  await expect(hb.locator("[data-testid=row-low]")).toHaveValue("130");
  await expect(hb.locator("[data-testid=row-high]")).toHaveValue("170");
  await expect(hb.locator("[data-testid=row-unit]")).toHaveValue("g/L");
  const wbc = await reviewRow(page, "White Cell Count");
  await expect(wbc.locator("[data-testid=row-value]")).toHaveValue("7.2");
  await expect(wbc.locator("[data-testid=row-unit]")).toHaveValue("x10^9/L");
  await expect(wbc.locator("[data-testid=row-low]")).toHaveValue("4");
  await expect(wbc.locator("[data-testid=row-high]")).toHaveValue("11");
  const platelets = await reviewRow(page, "Platelet Count");
  await expect(platelets.locator("[data-testid=row-value]")).toHaveValue("250");
  await expect(platelets.locator("[data-testid=row-high]")).toHaveValue("400");
  const a1c = await reviewRow(page, "HbA1c");
  await expect(a1c.locator("[data-testid=row-value]")).toHaveValue("6.2");
  await expect(a1c.locator("[data-testid=row-high]")).toHaveValue("5.7");
  const ldl = await reviewRow(page, "LDL Cholesterol");
  await expect(ldl.locator("[data-testid=row-value]")).toHaveValue("3.8");
  await expect(ldl.locator("[data-testid=row-high]")).toHaveValue("3.4");
  const hdl = await reviewRow(page, "HDL Cholesterol");
  await expect(hdl.locator("[data-testid=row-low]")).toHaveValue("1");
  expect(await labCount(page)).toBe(0);
  await page.screenshot({ path: path.join(artifacts, "screenshot_scan_review.png") });
});

test("sample data stays optional and the main screens fit an iPhone", async ({ page }) => {
  await page.getByTestId("tab-more").click();
  await page.screenshot({ path: path.join(artifacts, "screenshot_more.png") });
  await page.getByTestId("load-sample").click();
  await page.getByTestId("modal-confirm").click();
  await expect(page.getByTestId("home-bp")).toContainText("128/82");
  await expect(page.getByTestId("home-labs")).toContainText("SAMPLE");
  await expect(page.getByTestId("flagged")).toBeVisible();
  await page.evaluate(() => {
    document.getElementById("toast").hidden = true;
  });
  await noOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "screenshot_home.png") });
  await page.getByTestId("tab-add").click();
  await noOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "screenshot_add.png") });
  await page.getByTestId("tab-trends").click();
  await expect(page.getByTestId("chart-bp")).toBeVisible();
  await expect(page.locator("[data-testid=chart-lab]").first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: path.join(artifacts, "screenshot_trends.png") });
  await page.getByTestId("tab-more").click();
  await page.getByTestId("clear-sample").click();
  await expect(page.getByTestId("home-empty")).toBeVisible();
  await expect(page.getByTestId("home-bp")).toHaveCount(0);
  await expect(page.getByTestId("home-labs")).toHaveCount(0);
});
