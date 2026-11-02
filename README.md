# HealthLog

HealthLog is a mobile-first health records tracker. It is a static Progressive Web App meant to be opened from an iPhone home screen. There is no account and no server.

GitHub Pages can serve it from the repository root at `https://yyjason5565.github.io/healthlog/`. Paths are relative, so the same files also work under that `/healthlog/` subpath. `.nojekyll` is included so Pages serves the files as-is.

## What you can record

Screening results follow a built-in catalog based on the printed names, units, and generic reference ranges of an Innoquest Pathology general screening panel (GS15M). Panels group the tests. Each test can be numeric, qualitative, or both, including censored values such as `<20`. A range saved on a result overrides the catalog default. You can add your own tests.

The profile stores a patient name, sex, and date of birth on this device only. Each report also stores a patient name, collection date, lab, lab number, doctor or clinic, and whether the sample was fasting. The profile name is shown in the header. The report name is shown on the checklist and on a test’s history.

Blood pressure, weight and BMI, home blood sugar, medications, and doctor visits are still there. Every entry can be edited or deleted. Flagged tests can have a follow-up note and date, which show on Home.

## Scanning a report

Use **Choose photo** for the camera roll or **Take photo** for the camera. Both are normal file inputs (`accept="image/*"`, and `capture="environment"` for the camera), which is what iPhone Safari supports. You can also paste the printed text.

The photo is downscaled, turned grayscale, and given a contrast stretch with a light threshold before recognition. Recognition uses Tesseract.js with the worker, the WebAssembly core, and English traineddata stored in `vendor/tesseract/`. Those paths are relative (`workerPath`, `corePath`, `langPath`), so the photo and the OCR files stay on the phone.

HealthLog then tries to read rows of test name, value, unit, and reference range (`4.0 - 5.6`, `< 5.2`, `> 1.0`, `H` / `L`, and units such as mmol/L, mg/dL, g/L, %, U/L, umol/L, and x10^9/L). You get an editable review table, a report date, and a lab name. Nothing is saved until you tap **Save results**.

## Home, flags, and trends

Home shows the latest blood pressure, weight and BMI, blood sugar, recent labs, active medications, and upcoming follow-ups.

A value is compared with the range saved from the report when there is one. Otherwise HealthLog uses a clearly labelled general adult range (blood pressure categories, fasting glucose, HbA1c, BMI, and common lipids and blood counts). Flags include a short plain-language note and always say to discuss the result with a doctor. The app does not diagnose and does not suggest changing a medicine.

Readings that are widely treated as urgent get a red **Seek medical care promptly** banner. That includes blood pressure at or above 180/120, glucose under 3.0 mmol/L or at or above 15 mmol/L, and a few other extremes (very low haemoglobin, or potassium or sodium far outside a usual blood range). In Malaysia the emergency number shown is 999.

Trends plot blood pressure (both lines), weight, blood sugar, and any lab test with two or more results. The reference band is shaded when there is a single range. Time filters are 3 months, 6 months, 1 year, and all. Three results moving the same way can show “Rising over the last 3 results” or “Falling over the last 3 results.”

Charts are drawn with Chart.js from `vendor/chart.umd.min.js`. No chart library is loaded from a CDN.

## Backup version 2

Export writes version 2 JSON. Import still accepts version 1. Version 1 `labs` rows are matched to catalog tests by name and alias, and rows that share a collection date and lab name become one report. A version 1 name that does not match is kept as a custom test.

`profile.patientName` is the name in the header. `reports[].patientName` is the name stored with that report. `profile.cvRisk` is `""`, `"low"`, `"moderate"`, `"high"`, `"veryhigh"`, or `"recurrent"`. `profile.sex` is `""`, `"female"`, or `"male"`. `results[].comparator` is `""`, `"<"`, `"<="`, `">"`, or `">="`. `results[].specimen` is `""`, `"fasting"`, or `"random"`. `reports[].fasting` is `true`, `false`, or `null`.

```json
{
  "app": "HealthLog",
  "version": 2,
  "exportedAt": "2026-03-13T00:00:00.000Z",
  "data": {
    "profile": {
      "patientName": "Demo Person",
      "sex": "male",
      "dob": "1980-01-01",
      "cvRisk": "",
      "theme": "system",
      "glucoseUnit": "mmol/L",
      "heightCm": 170,
      "hintDismissed": false
    },
    "reports": [
      {
        "id": "rpt-sample-1",
        "dateCollected": "2026-03-13",
        "patientName": "Demo Person",
        "lab": "Fictional Sample Lab",
        "labNumber": "GS-SAMPLE-001",
        "doctor": "Dr Example (fictional)",
        "fasting": true,
        "notes": "Fictional demo. Not a real person.",
        "sample": true
      }
    ],
    "results": [
      {
        "id": "res-sample-hb",
        "testId": "hb",
        "name": "Haemoglobin",
        "reportId": "rpt-sample-1",
        "date": "2026-03-13",
        "numeric": 140,
        "comparator": "",
        "qualitative": "",
        "unit": "g/L",
        "secondaryNumeric": null,
        "secondaryUnit": "",
        "specimen": "",
        "refLow": 130,
        "refHigh": 170,
        "lowInclusive": true,
        "highInclusive": true,
        "refText": "130 - 170",
        "flag": "",
        "notes": "Fictional demo. Not a real person.",
        "sample": true
      }
    ],
    "followups": [
      {
        "id": "fu-sample-1",
        "testId": "hpylori",
        "resultId": "",
        "reportId": "rpt-sample-1",
        "action": "Fictional: ask about a urea breath test",
        "date": "2026-06-01",
        "notes": "Not a real appointment.",
        "done": false,
        "sample": true
      }
    ],
    "customTests": [],
    "bp": [],
    "weights": [],
    "glucose": [],
    "meds": [],
    "visits": []
  }
}
```

- **Export JSON backup** uses the share sheet when the phone allows it, otherwise a download, so the file can be kept in Files.
- **Import backup** checks the file, then asks you to merge or replace.
- **Export CSV** writes a spreadsheet of the readings.
- **Delete all data** asks first. Theme and profile settings stay; the health records do not.
- **Load sample data** adds fictional rows marked SAMPLE, including the name “Demo Person (SAMPLE)”. Nothing fictional is loaded on its own. **Remove sample data** deletes only those rows.

## Privacy

Records live in IndexedDB on this device. A few preferences (theme, glucose unit, height, and whether the home-screen hint was dismissed) live in localStorage. There is no backend, no analytics, and no request that sends health data anywhere. OCR and charts are vendored. A photo is decoded in the browser and is not uploaded.

Clearing Safari website data for this site, or browsing in Private mode, deletes the records unless you exported a backup. Each phone that opens the link gets its own empty tracker.

The app is not medical advice. That disclaimer stays visible.

## Add to the Home Screen (iPhone Safari)

1. Open the GitHub Pages link in Safari (not inside another app’s browser).
2. Tap the Share button (square with an arrow).
3. Tap **Add to Home Screen**, then **Add**.
4. Open HealthLog from the new icon. It runs full screen and can open again offline after the first visit, because a service worker caches the app shell and the vendored libraries.

The manifest name is HealthLog, display is standalone, and icons are included at 180, 192, and 512 pixels, including `apple-touch-icon.png`. The status bar uses the safe area around the notch.

## OCR limits

Printed English lab reports in a clear photo work best. The parser expects a test name, a number, and a unit on roughly the same line, with an optional range. It will miss or misread:

- handwriting, stamps, and heavy glare
- tables with very small type or columns that run into each other
- languages other than English (only `eng` traineddata is bundled)
- unusual units or ranges that do not look like `4.0 - 5.6`, `< 5.2`, or `> 1.0`
- a stray `H` or `L` that the camera turns into another letter
- white text on a coloured header (the lab name is easier to read when it is dark type)

A few common misreads are repaired before the review step: `HbA1c` when the `1` is seen as a letter, and `x10^9/L` when the caret is missed. Other mistakes stay in the table for you to fix.

Always use the review table. If the photo fails, paste the text. That uses the same parser and the same review step.

General ranges are screening figures for adults, not your personal target. A printed range from the lab is the one HealthLog prefers.

## Develop

The site itself has no build. From this folder:

```bash
npm install
npx playwright install webkit
npm test
```

`npm test` runs the parser, flag, and backup checks, then Playwright with WebKit at a 375×812 iPhone viewport against `http://127.0.0.1:4173/healthlog/`. `npm start` serves the same static files.

Vendored libraries:

- Tesseract.js 5.1.1 (`vendor/tesseract/tesseract.min.js`, `worker.min.js`)
- tesseract.js-core 5.1.1 LSTM builds, SIMD and non-SIMD, with the wasm inlined
- English traineddata from `@tesseract.js-data/eng` 4.0.0_best_int (`eng.traineddata.gz`)
- Chart.js 4.4.6 (`vendor/chart.umd.min.js`)

Icons and the fictional lab-report fixture can be regenerated with `python3 scripts/generate-assets.py`. The numbers in that image are invented.
