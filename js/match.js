import { CATALOG } from "./catalog.js";

function fold(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/[：:]/g, " ")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value) {
  return fold(value).replace(/ /g, "");
}

export function matchTest(name, extra = []) {
  const tests = [...CATALOG, ...extra];
  const folded = fold(name);
  const squashed = compact(name);
  if (!folded && !squashed) return null;
  let best = null;
  let bestScore = 0;
  tests.forEach((item) => {
    const aliases = [item.name, ...(item.aliases || [])];
    aliases.forEach((alias) => {
      const aliasFold = fold(alias);
      const aliasSquash = compact(alias);
      if (!aliasFold) return;
      let score = 0;
      if (squashed === aliasSquash || folded === aliasFold) score = 100 + aliasSquash.length;
      else if (aliasSquash.length >= 2 && /[\u3400-\u9fff]/.test(alias) && squashed.includes(aliasSquash)) score = 80 + aliasSquash.length;
      else if (aliasSquash.length >= 4 && squashed.includes(aliasSquash)) score = 50 + aliasSquash.length;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });
  });
  return best;
}

export function reportGroupKey(date, lab) {
  return `${String(date || "").slice(0, 10)}|${String(lab || "").trim()}`;
}

export function specimenFromName(name) {
  const text = fold(name);
  if (/\bfasting\b|\bfbs\b/.test(text)) return "fasting";
  if (/\brandom\b/.test(text)) return "random";
  return "";
}
