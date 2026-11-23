// R09 scoring. The only step that reads gold boxes and answers. Usage:
//   node src/r09-score.mjs --design <design.json> --render <render.json> --gold <gold.json> --raw <raw.jsonl> --out <dir>
// Writes <out>/score.json and <out>/summary.md (deterministic for identical inputs).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES, alignRecords, classify, pairStats } from "./r09-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [designF, renderF, goldF, rawF, out] = ["--design", "--render", "--gold", "--raw", "--out"].map(arg);
if (!designF || !renderF || !goldF || !rawF || !out) throw new Error("--design, --render, --gold, --raw and --out are required");
const design = JSON.parse(readFileSync(designF, "utf8"));
const render = JSON.parse(readFileSync(renderF, "utf8"));
const gold = JSON.parse(readFileSync(goldF, "utf8")).gold;
const raw = readFileSync(rawF, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const ids = design.images.map((im) => im.id);
const recs = alignRecords(ids, raw);

// Same token and word rule as selector.mjs selectWindow (copied for attribution only; selection itself is not redone).
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9\- ]/g, " ").split(/\s+/).filter(Boolean);
const matchWord = (keys, w) => keys.some((k) => { const t = tokens(w)[0] || ""; return t === k || (k.length >= 4 && t.length >= 4 && (t.startsWith(k) || k.startsWith(t))); });

/** Which rendered item each matched OCR word falls on (word centre inside the item's ink box grown by 2 px). */
function attribute(im, rec) {
  if (rec.status !== "ok" || !rec.matched || !rec.matchedLine) return { source: null, hits: [] };
  const items = render.images[im.id].items;
  const hits = rec.matchedLine.words.filter((w) => matchWord(rec.keys, w.text)).map((w) => {
    const cx = w.box[0] + w.box[2] / 2;
    const cy = w.box[1] + w.box[3] / 2;
    const on = Object.entries(items).find(([, v]) => cx >= v.ink[0] - 2 && cx < v.ink[2] + 2 && cy >= v.ink[1] - 2 && cy < v.ink[3] + 2);
    return { text: w.text, box: w.box.map((n) => Math.round(n * 100) / 100), item: on ? on[0] : null, role: on ? on[1].role : null, target: on ? on[0] === im.anchorItem : false };
  });
  const roles = new Set(hits.map((h) => h.role));
  const source = roles.has("code") ? "code" : roles.has("label") ? "label" : "other";
  return { source, hits, onTargetAnchor: hits.some((h) => h.target) };
}

const perImage = {};
for (const im of design.images) {
  const rec = recs.get(im.id);
  const c = classify(rec, gold[im.id].parts, im.page);
  const a = attribute(im, rec);
  perImage[im.id] = {
    id: im.id, pairId: im.pairId, lang: im.lang, doctype: im.doctype, layout: im.layout, anchor: im.anchor, seed: im.seed,
    category: c.category, reason: c.reason ?? null, success: c.success, evidencePreserved: c.evidencePreserved, areaRatio: c.areaRatio === null ? null : Math.round(c.areaRatio * 1e6) / 1e6, missingParts: c.missingParts,
    keys: rec.keys ?? null, lineText: rec.lineText ?? null, confidence: rec.confidence ?? null, band: rec.band ?? null, tiedWithPick: rec.tiedWithPick ?? null, candidates: rec.candidates ? rec.candidates.length : null,
    source: a.source, onTargetAnchor: a.onTargetAnchor ?? null, hits: a.hits, goldSizes: gold[im.id].parts.map((p) => ({ item: p.item, role: p.role, size: p.size })),
  };
}

const pairsOf = (f) => design.pairs.filter(f).map((p) => p.pairId);
const SETS = { code: pairsOf((p) => p.anchor === "code"), nl: pairsOf((p) => p.anchor === "nl"), all: pairsOf(() => true) };
const sets = {};
for (const [name, pids] of Object.entries(SETS)) {
  const st = pairStats(pids, perImage);
  const byLang = {};
  for (const lang of ["en", "ko"]) {
    const rows = pids.map((p) => perImage[`${p}-${lang}`]);
    const cat = Object.fromEntries(CATEGORIES.map((k) => [k, rows.filter((r) => r.category === k).length]));
    const ok = rows.filter((r) => r.category !== "tech_error");
    byLang[lang] = {
      n: rows.length, categories: cat, evidencePreserved: ok.filter((r) => r.evidencePreserved).length, observed: ok.length,
      meanAreaRatio: ok.length ? Math.round((ok.reduce((s, r) => s + r.areaRatio, 0) / ok.length) * 1e4) / 1e4 : null,
      meanAreaRatioSuccess: rows.some((r) => r.success) ? Math.round((rows.filter((r) => r.success).reduce((s, r) => s + r.areaRatio, 0) / rows.filter((r) => r.success).length) * 1e4) / 1e4 : null,
      sources: Object.fromEntries(["code", "label", "other"].map((s) => [s, rows.filter((r) => r.source === s).length])),
    };
  }
  const discordant = pids.filter((p) => perImage[`${p}-en`].success !== perImage[`${p}-ko`].success).map((p) => ({ pairId: p, en: perImage[`${p}-en`].category, ko: perImage[`${p}-ko`].category }));
  sets[name] = { pairs: pids.length, ...st, byLang, discordant };
}

// Strata: doc type x anchor x language, with denominators.
const strata = [];
for (const doctype of [...new Set(design.pairs.map((p) => p.doctype))])
  for (const anchor of ["code", "nl"])
    for (const lang of ["en", "ko"]) {
      const rows = Object.values(perImage).filter((r) => r.doctype === doctype && r.anchor === anchor && r.lang === lang);
      if (!rows.length) continue;
      strata.push({ doctype, anchor, lang, n: rows.length, success: rows.filter((r) => r.success).length, ...Object.fromEntries(CATEGORIES.map((k) => [k, rows.filter((r) => r.category === k).length])) });
    }

const score = { design: design.version, set: design.set, rule: "success = matched, window area in (0, page area), every gold part inside the half-open window, 0 px tolerance", sets, strata, images: ids.map((id) => perImage[id]) };
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.json"), `${JSON.stringify(score, null, 1)}\n`);

const pct = (x) => (x === null ? "-" : `${(x * 100).toFixed(1)}%`);
const md = [`# R09 결과 요약 (${design.set})`, "", "자동 생성: `src/r09-score.mjs`. 성공 = 일치 + 페이지보다 작은 창 + 금표준 전부 포함(반개방, 0px).", ""];
for (const [name, s] of Object.entries(sets)) {
  md.push(`## 집합 ${name} (쌍 ${s.n})`, "", "| 언어 | 성공 | 작은 창 전체 포함 | 작은 창 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 | 최종 근거 보존/관측 | 평균 면적비(관측) |", "|---|---|---|---|---|---|---|---|---|");
  for (const lang of ["en", "ko"]) {
    const b = s.byLang[lang];
    md.push(`| ${lang.toUpperCase()} | ${b.categories.window_complete}/${b.n} | ${b.categories.window_complete} | ${b.categories.window_partial} | ${b.categories.matched_full} | ${b.categories.no_match_full} | ${b.categories.tech_error} | ${b.evidencePreserved}/${b.observed} | ${b.meanAreaRatio ?? "-"} |`);
  }
  md.push("", `2×2: 양쪽 성공 ${s.table.both}, EN만 ${s.table.enOnly}, KO만 ${s.table.koOnly}, 양쪽 실패 ${s.table.neither}. KO−EN = (${s.table.koOnly} − ${s.table.enOnly}) / ${s.n} = ${pct(s.diff)}.`);
  md.push(`기술 결측: EN만 ${s.missing.enOnly}, KO만 ${s.missing.koOnly}, 동시 ${s.missing.both}. 완전 쌍 ${s.complete.n}: KO−EN ${pct(s.complete.diff)}. 결측 상·하한: ${pct(s.bounds.min)} ~ ${pct(s.bounds.max)}.`, "");
}
md.push("## 계층 (문서형 × 앵커 × 언어)", "", "| 문서형 | 앵커 | 언어 | n | 성공 | 부분 누락 | 일치 후 전체 | 불일치 전체 | 기술 실패 |", "|---|---|---|---|---|---|---|---|---|");
for (const s of strata) md.push(`| ${s.doctype} | ${s.anchor} | ${s.lang} | ${s.n} | ${s.success} | ${s.window_partial} | ${s.matched_full} | ${s.no_match_full} | ${s.tech_error} |`);
md.push("", "## 이미지별 원시 결과", "", "| 이미지 | 범주 | 면적비 | 키 | 일치 줄 | 신뢰도 | 출처 | 누락 |", "|---|---|---|---|---|---|---|---|");
for (const id of ids) {
  const r = perImage[id];
  md.push(`| ${id} | ${r.category} | ${r.areaRatio ?? "-"} | ${(r.keys || []).join(" ") || "(없음)"} | ${(r.lineText || "").replace(/\|/g, "/").slice(0, 60)} | ${r.confidence ?? "-"} | ${r.source ?? "-"} | ${(r.missingParts || []).join(" ")} |`);
}
writeFileSync(join(out, "summary.md"), `${md.join("\n")}\n`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, { en: s.en.success, ko: s.ko.success, n: s.n, diff: s.diff, table: s.table }]))));
