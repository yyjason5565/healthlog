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

async function reviewRow(page, testId) {
  const rows = page.locator("[data-testid=review-row]");
  const count = await rows.count();
  for (let i = 0; i < count; i += 1) {
    const row = rows.nth(i);
    if (await row.locator("[data-testid=row-test]").inputValue() === testId) return row;
  }
  throw new Error(`No review row mapped to ${testId}`);
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
  expect(leaks.get(page) || []).toEqual([]);
});

test("loads under /healthlog with privacy and no sideways scroll", async ({ page }) => {
  await expect(page.getByTestId("disclaimer")).toContainText("Not medical advice");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  const manifest = await (await page.request.get("./manifest.json")).json();
  expect(manifest.name).toBe("HealthLog");
  expect(manifest.display).toBe("standalone");
  await page.getByTestId("tab-more").click();
  await expect(page.getByTestId("privacy-note")).toContainText("IndexedDB");
  await expect(page.getByTestId("homescreen-help")).toContainText("Add to Home Screen");
  for (const tab of ["home", "panels", "add", "scan", "more"]) {
    await page.getByTestId(`tab-${tab}`).click();
    await noOverflow(page);
  }
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration()), null, { timeout: 15000 });
});

test("shows the profile name and a named screening report", async ({ page }) => {
  await page.getByTestId("tab-more").click();
  await page.getByTestId("set-name").fill("Demo Person");
  await page.getByTestId("set-name").blur();
  await expect(page.getByTestId("header-patient")).toHaveText("Demo Person");

  await page.getByTestId("tab-add").click();
  await expect(page.getByTestId("entry-hb")).toBeVisible();
  await expect(page.getByTestId("report-patient")).toHaveValue("Demo Person");
  await page.getByTestId("report-date").fill("2026-03-13");
  await page.getByTestId("report-lab").fill("Fictional Sample Lab");
  await page.getByTestId("entry-hb").fill("140");
  await page.getByTestId("entry-hba1c").fill("6.0");
  await page.getByTestId("qual-hepa-igg").selectOption("Detected");
  await page.getByTestId("save-report").click();

  await expect(page.getByTestId("report-patient-label")).toContainText("Report for Demo Person");
  await expect(page.getByTestId("checklist")).toContainText("Demo Person");
  await expect(page.getByTestId("panel-test-hb")).toContainText("140");
  await page.getByTestId("panel-test-hba1c").click();
  await expect(page.getByTestId("tier")).toContainText(/prediabetes/i);
  await expect(page.getByRole("region", { name: "Test history" }).getByTestId("report-patient-label")).toContainText("Demo Person");
  await page.getByTestId("follow-action").fill("Fictional: repeat lipids in 3-6 months");
  await page.getByTestId("follow-date").fill("2026-08-01");
  await page.getByTestId("save-follow").click();
  await expect(page.getByTestId("followups")).toContainText("repeat lipids");
  await expect(page.getByTestId("header-patient")).toHaveText("Demo Person");
  await page.getByTestId("tab-panels").click();
  const hepa = page.getByTestId("panel-test-hepa-igg");
  await expect(hepa).toContainText("Detected");
  await expect(hepa).not.toContainText("Above");
});

test("imports a version 1 file into one catalog report", async ({ page }) => {
  const labs = ["Haemoglobin", "Fasting glucose", "LDL-C", "eGFR (CKD-EPI)", "Urine SG"].map((name, index) => ({
    id: `v1-${index}`,
    testName: name,
    value: 10 + index,
    unit: "",
    date: "2026-04-01",
    lab: "Fictional Import Lab",
    notes: "Fake import fixture.",
  }));
  await page.getByTestId("tab-more").click();
  await page.getByTestId("import-file").setInputFiles({
    name: "healthlog-v1.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "HealthLog", version: 1, data: { labs } })),
  });
  await page.getByTestId("modal-replace").click();
  await page.getByTestId("tab-panels").click();
  await expect(page.getByTestId("checklist")).toContainText("5 of");
  await expect(page.getByTestId("panel-test-hb")).toContainText("10");
  await expect(page.getByTestId("panel-test-glucose")).toContainText("11");
  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("healthlog");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(["reports", "results", "customTests"], "readonly");
      const pack = {};
      let left = 3;
      ["reports", "results", "customTests"].forEach((name) => {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          pack[name] = req.result;
          left -= 1;
          if (left === 0) resolve(pack);
        };
      });
    };
  }));
  expect(stored.reports).toHaveLength(1);
  expect(stored.reports[0].lab).toBe("Fictional Import Lab");
  expect(stored.customTests).toHaveLength(0);
  expect(stored.results.map((row) => row.testId).sort()).toEqual(["egfr", "glucose", "hb", "ldl", "urine-sg"]);
  expect(stored.results.find((row) => row.testId === "glucose").specimen).toBe("fasting");
});

test("reads a fictional lab photo into catalog rows", async ({ page }) => {
  await page.getByTestId("tab-scan").click();
  await page.getByTestId("scan-file").setInputFiles(path.join(root, "tests/fixtures/lab-report.png"));
  await expect(page.getByTestId("review")).toBeVisible({ timeout: 150000 });
  const hb = await reviewRow(page, "hb");
  await expect(hb.locator("[data-testid=row-value]")).toHaveValue("138");
  await expect(hb.locator("[data-testid=row-low]")).toHaveValue("130");
  await expect(hb.locator("[data-testid=row-high]")).toHaveValue("170");
  const a1c = await reviewRow(page, "hba1c");
  await expect(a1c.locator("[data-testid=row-value]")).toHaveValue("6.2");
  const ldl = await reviewRow(page, "ldl");
  await expect(ldl.locator("[data-testid=row-value]")).toHaveValue("3.8");
  await page.screenshot({ path: path.join(artifacts, "screenshot_scan_review.png") });
});

test("sample panel, vitals, and backup version 2", async ({ page }) => {
  await page.getByTestId("tab-more").click();
  await page.getByTestId("set-name").fill("Demo Person");
  await page.getByTestId("set-name").blur();
  await page.screenshot({ path: path.join(artifacts, "screenshot_more.png") });
  await page.getByTestId("load-sample").click();
  await page.getByTestId("modal-confirm").click();
  await expect(page.getByTestId("report-patient-label")).toContainText("Demo Person (SAMPLE)");
  await expect(page.getByTestId("panel-test-ldl")).toContainText("3.1");
  await page.evaluate(() => { document.getElementById("toast").hidden = true; });
  await page.screenshot({ path: path.join(artifacts, "screenshot_panels.png") });
  await page.getByTestId("tab-home").click();
  await expect(page.getByTestId("header-patient")).toHaveText("Demo Person");
  await expect(page.getByTestId("home-bp")).toContainText("128/82");
  await expect(page.getByTestId("chart-bp")).toBeVisible();
  await expect(page.getByTestId("followups")).toContainText("urea breath test");
  await page.evaluate(() => { document.getElementById("toast").hidden = true; });
  await page.screenshot({ path: path.join(artifacts, "screenshot_home.png") });
  await page.getByTestId("tab-add").click();
  await page.getByRole("button", { name: "Blood pressure", exact: true }).click();
  const bp = page.getByTestId("form-bp");
  await bp.getByTestId("bp-sys").fill("122");
  await bp.getByTestId("bp-dia").fill("78");
  await bp.getByTestId("bp-date").fill(stamp(0).time);
  await bp.getByTestId("save-bp").click();
  await expect(page.getByTestId("entry-list")).toContainText("122/78");
  await page.screenshot({ path: path.join(artifacts, "screenshot_add.png") });

  await page.getByTestId("tab-more").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-json").click();
  const download = await downloadPromise;
  const file = path.join("/tmp", download.suggestedFilename());
  await download.saveAs(file);
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(payload.version).toBe(2);
  expect(payload.data.profile.patientName).toBe("Demo Person");
  expect(payload.data.results.some((row) => row.testId === "hb")).toBeTruthy();
  expect(payload.data.reports[0].patientName).toBe("Demo Person (SAMPLE)");
});
