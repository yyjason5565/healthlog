/** Innoquest-style GS15M screening catalog. Ranges are the printed generic cut-offs, not a person's results. */

export const PANELS = [
  ["haematology", "Haematology"],
  ["lipids", "Lipids"],
  ["electrolytes", "Electrolytes"],
  ["renal", "Renal"],
  ["liver", "Liver"],
  ["glucose", "Glucose"],
  ["diabetes", "Diabetes"],
  ["inflammation", "Inflammation"],
  ["thyroid", "Thyroid"],
  ["tumour", "Tumour markers"],
  ["serology", "Serology and immunology"],
  ["hormones", "Hormones"],
  ["urine", "Urine FEME"],
  ["custom", "Custom"],
];

function range(low, high, text) {
  return { low, high, lowInclusive: true, highInclusive: true, text: text || `${low}–${high}` };
}

function below(high, text) {
  return { low: null, high, lowInclusive: true, highInclusive: false, text: text || `<${high}` };
}

function above(low, text) {
  return { low, high: null, lowInclusive: false, highInclusive: true, text: text || `>${low}` };
}

function test(partial) {
  return {
    resultType: "numeric",
    aliases: [],
    ref: null,
    secondary: null,
    sex: "",
    qualKind: "",
    about: "",
    ...partial,
  };
}

export const CATALOG = [
  test({ id: "blood-group", name: "Blood group", aliases: ["blood group", "abo", "abo rh", "blood type"], panel: "haematology", unit: "", resultType: "text", about: "ABO and Rh blood group, recorded as text such as O+." }),
  test({ id: "hb", name: "Haemoglobin", aliases: ["haemoglobin", "hemoglobin", "hb", "hgb", "红血素"], panel: "haematology", unit: "g/L", ref: range(130, 170), about: "Haemoglobin carries oxygen in red blood cells. This printed band is the male screening range on the GS15M panel." }),
  test({ id: "rbc", name: "RBC", aliases: ["rbc", "red blood cell", "red cell count", "erythrocyte", "红血球"], panel: "haematology", unit: "x10^12/L", ref: range(4.6, 6.1, "4.60–6.10"), about: "Red blood cell count." }),
  test({ id: "pcv", name: "PCV", aliases: ["pcv", "haematocrit", "hematocrit", "hct", "红血球压量"], panel: "haematology", unit: "L/L", ref: range(0.4, 0.5, "0.40–0.50"), about: "Packed cell volume, the fraction of blood that is red cells." }),
  test({ id: "mcv", name: "MCV", aliases: ["mcv", "mean cell volume", "mean corpuscular volume"], panel: "haematology", unit: "fL", ref: range(80, 100), about: "Average size of red blood cells." }),
  test({ id: "mch", name: "MCH", aliases: ["mch", "mean cell haemoglobin", "mean cell hemoglobin", "mean corpuscular hemoglobin"], panel: "haematology", unit: "pg", ref: range(27, 32), about: "Average amount of haemoglobin in each red cell." }),
  test({ id: "mchc", name: "MCHC", aliases: ["mchc", "mean cell haemoglobin concentration", "mean corpuscular hemoglobin concentration"], panel: "haematology", unit: "g/L", ref: range(300, 350), about: "Average concentration of haemoglobin inside red cells." }),
  test({ id: "rdw", name: "RDW", aliases: ["rdw", "red cell distribution width"], panel: "haematology", unit: "%", ref: range(11, 15, "11.0–15.0"), about: "How much red cell size varies." }),
  test({ id: "wbc", name: "White cell count", aliases: ["white cell count", "white cell", "wbc", "wcc", "twbc", "leukocyte", "白血球计数"], panel: "haematology", unit: "x10^9/L", ref: range(4, 10, "4.0–10.0"), about: "Total white cells in the blood." }),
  test({ id: "neut", name: "Neutrophils", aliases: ["neutrophils", "neutrophil", "neut", "anc", "absolute neutrophil"], panel: "haematology", unit: "x10^9/L", ref: range(2, 7, "2.0–7.0"), secondary: { unit: "%", label: "Percent" }, about: "A type of white cell. The absolute count is the main value; the percent is kept beside it." }),
  test({ id: "lymph", name: "Lymphocytes", aliases: ["lymphocytes", "lymphocyte", "lymph", "absolute lymphocyte"], panel: "haematology", unit: "x10^9/L", ref: range(1, 4, "1.0–4.0"), secondary: { unit: "%", label: "Percent" }, about: "A type of white cell. The absolute count is the main value." }),
  test({ id: "mono", name: "Monocytes", aliases: ["monocytes", "monocyte", "mono"], panel: "haematology", unit: "x10^9/L", ref: range(0.2, 1, "0.2–1.0"), secondary: { unit: "%", label: "Percent" }, about: "A type of white cell. The absolute count is the main value." }),
  test({ id: "eos", name: "Eosinophils", aliases: ["eosinophils", "eosinophil", "eos"], panel: "haematology", unit: "x10^9/L", ref: range(0.02, 0.5, "0.02–0.50"), secondary: { unit: "%", label: "Percent" }, about: "A type of white cell. The absolute count is the main value." }),
  test({ id: "baso", name: "Basophils", aliases: ["basophils", "basophil", "baso"], panel: "haematology", unit: "x10^9/L", ref: range(0, 0.1, "0.00–0.10"), secondary: { unit: "%", label: "Percent" }, about: "A type of white cell. The absolute count is the main value." }),
  test({ id: "nl-ratio", name: "N:L ratio", aliases: ["n:l ratio", "nl ratio", "neutrophil lymphocyte ratio", "neutrophil-lymphocyte ratio"], panel: "haematology", unit: "", ref: range(0.78, 3.53), about: "Neutrophil count divided by lymphocyte count." }),
  test({ id: "plt", name: "Platelets", aliases: ["platelets", "platelet", "plt", "thrombocyte", "血小板"], panel: "haematology", unit: "x10^9/L", ref: range(150, 410), about: "Platelets help blood clot." }),
  test({ id: "mpv", name: "MPV", aliases: ["mpv", "mean platelet volume"], panel: "haematology", unit: "fL", ref: range(8.82, 12), about: "Average size of platelets." }),
  test({ id: "pdw", name: "PDW", aliases: ["pdw", "platelet distribution width"], panel: "haematology", unit: "fL", ref: range(9.22, 15.41), about: "How much platelet size varies." }),
  test({ id: "esr", name: "ESR", aliases: ["esr", "erythrocyte sedimentation", "sed rate", "红血球沉降率"], panel: "haematology", unit: "mm/h", ref: below(21, "<21"), about: "Erythrocyte sedimentation rate, a non-specific look at inflammation." }),

  test({ id: "tc", name: "Total cholesterol", aliases: ["total cholesterol", "cholesterol", "tc"], panel: "lipids", unit: "mmol/L", ref: below(5.2, "<5.2"), about: "All cholesterol fractions added together." }),
  test({ id: "tg", name: "Triglyceride", aliases: ["triglyceride", "triglycerides", "tg"], panel: "lipids", unit: "mmol/L", ref: below(1.7, "<1.70"), about: "A blood fat that rises after a meal and with glucose." }),
  test({ id: "hdl", name: "HDL-C", aliases: ["hdl-c", "hdl", "hdl cholesterol"], panel: "lipids", unit: "mmol/L", ref: above(1, ">1.00"), about: "HDL cholesterol. Clinics often like to see this higher." }),
  test({ id: "ldl", name: "LDL-C", aliases: ["ldl-c", "ldl", "ldl cholesterol"], panel: "lipids", unit: "mmol/L", ref: below(2.6, "<2.60"), about: "LDL cholesterol. The printed screening cut-off is under 2.60 mmol/L. A cardiovascular-risk target you choose in profile can replace that when the report has no range of its own." }),
  test({ id: "non-hdl", name: "Non-HDL-C", aliases: ["non-hdl-c", "non hdl", "non-hdl"], panel: "lipids", unit: "mmol/L", ref: below(3.4, "<3.40"), about: "Total cholesterol minus HDL. The printed cut-off is under 3.40 mmol/L." }),
  test({ id: "tc-hdl", name: "TC/HDL ratio", aliases: ["tc/hdl", "tc hdl ratio", "cholesterol/hdl", "total cholesterol/hdl", "castelli risk index i", "cri-i"], panel: "lipids", unit: "", about: "Total cholesterol divided by HDL. Printed risk lines differ for men and women." }),
  test({ id: "ldl-hdl", name: "LDL/HDL ratio", aliases: ["ldl/hdl", "ldl hdl ratio", "castelli risk index ii", "cri-ii"], panel: "lipids", unit: "", about: "LDL divided by HDL. Printed risk lines differ for men and women." }),
  test({ id: "aip", name: "AIP", aliases: ["aip", "atherogenic index of plasma", "atherogenic index"], panel: "lipids", unit: "", about: "Atherogenic index of plasma, usually log(triglyceride / HDL)." }),

  test({ id: "na", name: "Sodium", aliases: ["sodium", "na"], panel: "electrolytes", unit: "mmol/L", ref: range(135, 145), about: "A blood salt that shifts with fluid balance." }),
  test({ id: "k", name: "Potassium", aliases: ["potassium", "k"], panel: "electrolytes", unit: "mmol/L", ref: range(3.5, 5.1), about: "A blood salt that affects muscles and heart rhythm." }),
  test({ id: "cl", name: "Chloride", aliases: ["chloride", "cl"], panel: "electrolytes", unit: "mmol/L", ref: range(95, 110), about: "A blood salt that travels with sodium and fluid." }),

  test({ id: "urea", name: "Urea", aliases: ["urea", "bun"], panel: "renal", unit: "mmol/L", ref: range(2.5, 8.5), about: "A waste product cleared by the kidneys. It also moves with hydration." }),
  test({ id: "creatinine", name: "Creatinine", aliases: ["creatinine"], panel: "renal", unit: "umol/L", ref: range(50, 116), about: "A waste product from muscle, cleared by the kidneys." }),
  test({ id: "egfr", name: "eGFR", aliases: ["egfr", "egfr (ckd-epi)", "ckd-epi", "gfr", "estimated glomerular"], panel: "renal", unit: "mL/min/1.73m2", about: "Estimated kidney filtering rate. Stages follow the usual KDIGO bands." }),
  test({ id: "uric", name: "Uric acid", aliases: ["uric acid", "urate"], panel: "renal", unit: "mmol/L", ref: range(0.18, 0.47), about: "A breakdown product that can form crystals when it is high." }),
  test({ id: "calcium", name: "Calcium", aliases: ["calcium", "ca"], panel: "renal", unit: "mmol/L", ref: range(2.1, 2.55, "2.10–2.55"), about: "Calcium in the blood." }),
  test({ id: "calcium-corr", name: "Corrected calcium", aliases: ["corrected calcium", "calcium corrected", "adj calcium"], panel: "renal", unit: "mmol/L", ref: range(2.1, 2.55, "2.10–2.55"), about: "Calcium adjusted for albumin." }),
  test({ id: "phosphate", name: "Phosphate", aliases: ["phosphate", "phosphorus", "po4"], panel: "renal", unit: "mmol/L", ref: range(0.65, 1.45), about: "Phosphate in the blood, often looked at with calcium and kidneys." }),

  test({ id: "protein", name: "Total protein", aliases: ["total protein", "protein total", "protein"], panel: "liver", unit: "g/L", ref: range(60, 82), about: "Albumin plus globulin in the blood." }),
  test({ id: "albumin", name: "Albumin", aliases: ["albumin"], panel: "liver", unit: "g/L", ref: range(35, 50), about: "A protein made by the liver that holds fluid in the blood." }),
  test({ id: "globulin", name: "Globulin", aliases: ["globulin"], panel: "liver", unit: "g/L", ref: range(20, 39), about: "A group of blood proteins that includes antibodies." }),
  test({ id: "ag-ratio", name: "A/G ratio", aliases: ["a/g ratio", "a/g", "albumin globulin ratio", "albumin/globulin ratio", "ag ratio"], panel: "liver", unit: "", ref: range(1, 2.5, "1.0–2.5"), about: "Albumin divided by globulin." }),
  test({ id: "alp", name: "ALP", aliases: ["alp", "alkaline phosphatase"], panel: "liver", unit: "U/L", ref: range(30, 150), about: "An enzyme from liver and bone." }),
  test({ id: "bilirubin", name: "Total bilirubin", aliases: ["total bilirubin", "bilirubin"], panel: "liver", unit: "umol/L", ref: below(21, "<21.0"), about: "A pigment from broken-down red cells, processed by the liver." }),
  test({ id: "ggt", name: "GGT", aliases: ["ggt", "gamma gt", "gamma-glutamyl"], panel: "liver", unit: "U/L", ref: below(51, "<51"), about: "A liver and bile-duct enzyme." }),
  test({ id: "ast", name: "AST", aliases: ["ast", "aspartate", "sgot"], panel: "liver", unit: "U/L", ref: below(41, "<41"), about: "An enzyme in liver, muscle, and other tissue." }),
  test({ id: "alt", name: "ALT", aliases: ["alt", "alanine", "sgpt"], panel: "liver", unit: "U/L", ref: below(51, "<51"), about: "An enzyme often used as a general look at the liver." }),

  test({ id: "glucose", name: "Glucose", aliases: ["glucose", "blood sugar", "fbs", "fasting glucose", "random glucose", "glu"], panel: "glucose", unit: "mmol/L", about: "Blood glucose. Fasting and random samples use different printed cut-offs." }),

  test({ id: "hba1c", name: "HbA1c", aliases: ["hba1c", "hb a1c", "a1c", "glycated haemoglobin", "glycated hemoglobin", "ifcc"], panel: "diabetes", unit: "%", secondary: { unit: "mmol/mol", label: "IFCC" }, about: "HbA1c estimates average glucose over about three months. The percent is the main value; IFCC mmol/mol is kept beside it." }),

  test({ id: "hscrp", name: "hsCRP", aliases: ["hscrp", "hs-crp", "crp", "c-reactive protein", "high sensitivity crp"], panel: "inflammation", unit: "mg/L", about: "A sensitive measure of inflammation used in heart-risk discussions. A very high value is often repeated." }),

  test({ id: "tsh", name: "TSH", aliases: ["tsh", "thyroid stimulating"], panel: "thyroid", unit: "mIU/L", ref: range(0.4, 4.7, "0.400–4.700"), about: "A pituitary signal that helps regulate the thyroid." }),

  test({ id: "afp", name: "AFP", aliases: ["afp", "alpha fetoprotein", "alpha-fetoprotein"], panel: "tumour", unit: "ug/L", ref: below(11, "<11"), about: "Alpha-fetoprotein, a tumour marker also affected by liver disease. A single result is not a diagnosis." }),
  test({ id: "cea", name: "CEA", aliases: ["cea", "carcinoembryonic"], panel: "tumour", unit: "ug/L", ref: below(5.1, "<5.1"), about: "CEA is a tumour marker. Smoking and some gut conditions can raise it. A single result is not a diagnosis." }),
  test({ id: "psa", name: "PSA", aliases: ["psa", "prostate specific", "prostate-specific"], panel: "tumour", unit: "ug/L", sex: "male", ref: below(3.51, "<3.51"), about: "Prostate-specific antigen. The printed age table is for men. A single result is not a diagnosis." }),
  test({ id: "ebv", name: "EBV VCA IgA", aliases: ["ebv vca iga", "ebv vca iga (npc screen)", "ebv", "vca iga", "epstein"], panel: "tumour", unit: "AU/mL", about: "An EBV antibody sometimes used in nasopharyngeal cancer screening. Tiers are negative, equivocal, and positive. It is not a diagnosis." }),

  test({ id: "rpr", name: "RPR", aliases: ["rpr", "syphilis", "rapid plasma reagin"], panel: "serology", unit: "", resultType: "qualitative", qualKind: "rpr", about: "A syphilis screening test. Non reactive is the usual negative result." }),
  test({ id: "hiv", name: "HIV 1&2 Ag/Ab", aliases: ["hiv", "hiv 1", "hiv ag", "hiv antibody", "hiv combo"], panel: "serology", unit: "", resultType: "qualitative", qualKind: "detected", about: "A combined HIV antigen and antibody screen. Not detected is the usual negative result." }),
  test({ id: "hbsag", name: "Hep B surface antigen", aliases: ["hbsag", "hep b surface antigen", "hepatitis b surface antigen", "hbs ag"], panel: "serology", unit: "", resultType: "qualitative", qualKind: "detected", about: "Hepatitis B surface antigen. Not detected is the usual negative result. Detected can mean current infection." }),
  test({ id: "hbsab", name: "Hep B surface antibody", aliases: ["hbsab", "hbs ab", "anti-hbs", "hep b surface antibody", "hepatitis b surface antibody"], panel: "serology", unit: "IU/L", qualKind: "immunity-numeric", about: "Hepatitis B surface antibody. A level of 10 IU/L or more is often called protective. A high number here is not a bad flag." }),
  test({ id: "hpylori", name: "H. pylori IgG", aliases: ["h pylori", "h. pylori", "h. pylori igg", "helicobacter", "pylori igg"], panel: "serology", unit: "index", about: "An antibody index for Helicobacter pylori. Positive can mean a past or current infection. A urea breath test is a follow-up people discuss with a doctor." }),
  test({ id: "hepa-igg", name: "Hep A IgG", aliases: ["hep a igg", "hepatitis a igg", "hav igg", "anti-hav"], panel: "serology", unit: "", resultType: "qualitative", qualKind: "hepa", about: "Hepatitis A IgG. Detected usually means past infection or vaccination, not a new illness, so it is not flagged as abnormal." }),
  test({ id: "rf", name: "Rheumatoid factor", aliases: ["rheumatoid factor", "rf"], panel: "serology", unit: "IU/mL", ref: below(20, "<20"), about: "An antibody related to some joint diseases. Many labs report it as under 20." }),

  test({ id: "testosterone", name: "Testosterone", aliases: ["testosterone"], panel: "hormones", unit: "nmol/L", sex: "male", ref: range(6.6, 25.7), about: "Testosterone. The printed range 6.6–25.7 nmol/L is a male range." }),

  test({ id: "urine-transparency", name: "Urine transparency", aliases: ["transparency", "appearance", "urine clarity"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "clear", about: "How clear the urine looks. Clear is the usual note." }),
  test({ id: "urine-colour", name: "Urine colour", aliases: ["colour", "color", "urine colour", "urine color"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "pale", about: "Urine colour. Pale yellow is the usual note on this panel." }),
  test({ id: "urine-sg", name: "Urine specific gravity", aliases: ["specific gravity", "sg", "urine sg"], panel: "urine", unit: "", ref: range(1.003, 1.035), about: "How concentrated the urine is." }),
  test({ id: "urine-ph", name: "Urine pH", aliases: ["urine ph", "ph"], panel: "urine", unit: "", ref: range(5, 9, "5.0–9.0"), about: "How acidic or alkaline the urine is." }),
  test({ id: "urine-leuc", name: "Urine leucocytes", aliases: ["urine leucocytes", "leucocytes", "leukocytes", "leucocyte", "wbc urine"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "A dipstick look for white cells in urine. Negative is the usual result." }),
  test({ id: "urine-blood", name: "Urine blood", aliases: ["urine blood", "blood", "occult blood"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "A dipstick look for blood in urine. Negative is the usual result." }),
  test({ id: "urine-nitrite", name: "Urine nitrite", aliases: ["nitrite", "nitrites"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "A dipstick marker some bacteria make. Negative is the usual result." }),
  test({ id: "urine-ketones", name: "Urine ketones", aliases: ["ketones", "ketone"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "Ketones in urine. Negative is the usual result." }),
  test({ id: "urine-bili", name: "Urine bilirubin", aliases: ["urine bilirubin"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "Bilirubin on the urine dipstick. Negative is the usual result." }),
  test({ id: "urine-protein", name: "Urine protein", aliases: ["urine protein", "proteinuria"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "negative", about: "Protein on the urine dipstick. Negative is the usual result." }),
  test({ id: "urine-uro", name: "Urobilinogen", aliases: ["urobilinogen"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "uro", about: "Urobilinogen on the urine dipstick. Normal is the usual result." }),
  test({ id: "urine-glucose", name: "Urine glucose", aliases: ["urine glucose", "glycosuria"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "urine-glucose", about: "Glucose on the urine dipstick. Normal or negative is the usual result." }),
  test({ id: "urine-wbc-micro", name: "Urine leucocytes (microscopy)", aliases: ["urine leucocytes (microscopy)", "microscopy leucocytes", "leucocytes microscopy", "pus cells", "wbc microscopy"], panel: "urine", unit: "x10^6/L", ref: below(10, "<10"), about: "White cells counted under the microscope." }),
  test({ id: "urine-rbc-micro", name: "Urine erythrocytes (microscopy)", aliases: ["urine erythrocytes (microscopy)", "microscopy erythrocytes", "erythrocytes", "rbc microscopy", "urine rbc"], panel: "urine", unit: "x10^6/L", ref: below(5, "<5"), about: "Red cells counted under the microscope." }),
  test({ id: "urine-epithelial", name: "Epithelial cells", aliases: ["epithelial", "epithelial cells"], panel: "urine", unit: "", resultType: "qualitative", qualKind: "seen", about: "Skin-like cells from the urinary tract. Not seen is the usual note." }),
  test({ id: "urine-casts", name: "Casts", aliases: ["casts", "cast"], panel: "urine", unit: "", resultType: "text", about: "Cylinder-shaped clumps seen on microscopy. Recorded as text." }),
  test({ id: "urine-crystals", name: "Crystals", aliases: ["crystals", "crystal"], panel: "urine", unit: "", resultType: "text", about: "Crystals seen on microscopy. Recorded as text." }),
];

export const QUAL_CHOICES = {
  rpr: ["Non reactive", "Reactive"],
  detected: ["Not detected", "Detected"],
  hepa: ["Not detected", "Detected"],
  clear: ["Clear", "Slightly cloudy", "Cloudy", "Turbid"],
  pale: ["Pale yellow", "Yellow", "Amber", "Red", "Brown", "Colourless"],
  negative: ["Negative", "Trace", "Positive"],
  uro: ["Normal", "Negative", "Trace", "Positive"],
  "urine-glucose": ["Normal", "Negative", "Trace", "Positive"],
  seen: ["Not seen", "Seen", "Few", "Moderate", "Many"],
};

export function panelLabel(id) {
  return PANELS.find(([key]) => key === id)?.[1] || id;
}

export function findTest(id, extra = []) {
  return [...CATALOG, ...extra].find((item) => item.id === id) || null;
}

export function testsFor(extra = []) {
  return [...CATALOG, ...extra];
}
