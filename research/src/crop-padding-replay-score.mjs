// Crop padding replay scorer (protocol sections 10-12). The only step that reads gold boxes and #141 results. Usage:
//   node src/crop-padding-replay-score.mjs --run <run dir> --evidence <evidence.json> --out <new dir>
// Checks the frozen evidence hashes first, then reads Git blobs: base-commit gold (blob and freeze-manifest SHA checked),
// #141 raw and score blobs, and the #141 RGB manifest at the product commit. Writes score.json and summary.md.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_COMMIT, sha256 } from "./mcp-view-comparison-lib.mjs";
import { EVIDENCE_FILES, PADDINGS, PRODUCT_COMMIT } from "./crop-padding-replay-lib.mjs";
import { JUDGEMENTS, aggregate, areaOf, assumedAreaOf, compare141, judgeRow, validateGold } from "./crop-padding-replay-score-lib.mjs";

export const GOLD_BLOB = "5d6c277d4c9cd55e4a101252fce8032294a21ae9";
export const RAW141_BLOB = "29729138f6344f8a869bfee1954c882fbfc6756b";
export const SCORE141_BLOB = "18502c11ef8c40579074919c0c1c77cb936f82ae";
const RAW141_PATH = "research/results/mcp-view-comparison/run-a/raw.jsonl";
const SCORE141_PATH = "research/results/mcp-view-comparison/score-a/score.json";
const RGB_MANIFEST_PATH = "research/results/mcp-view-comparison/rgb-manifest.json";
const H = "research/results/r09-bilingual/heldout";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const run = arg("--run");
const evidenceFile = arg("--evidence");
const out = arg("--out");
if (!run || !evidenceFile || !out) throw new Error("--run, --evidence and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);

const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
if (Object.keys(evidence.files ?? {}).sort().join() !== EVIDENCE_FILES.slice().sort().join()) throw new Error(`evidence must list exactly ${EVIDENCE_FILES.join(", ")}`);
for (const [f, h] of Object.entries(evidence.files)) if (sha256(readFileSync(join(run, f))) !== h) throw new Error(`evidence ${f} changed after freezing`);

const git = (args, enc = "utf8") => execFileSync("git", args, { cwd: here, encoding: enc, maxBuffer: 64 * 1024 * 1024 });
const blobAt = (commit, path, want) => {
  const id = git(["rev-parse", `${commit}:${path}`]).trim();
  if (want && id !== want) throw new Error(`${path} at ${commit.slice(0, 7)} is blob ${id}, not ${want}`);
  return git(["cat-file", "blob", id], "buffer");
};
const freeze = JSON.parse(blobAt(BASE_COMMIT, `${H}/freeze-manifest.json`).toString("utf8"));
const goldBytes = blobAt(BASE_COMMIT, `${H}/gold.json`, GOLD_BLOB);
if (sha256(goldBytes) !== freeze.inputs["gold.json"]) throw new Error("gold differs from its freeze manifest");
const gold = JSON.parse(goldBytes.toString("utf8")).gold;
const raw141 = blobAt(PRODUCT_COMMIT, RAW141_PATH, RAW141_BLOB).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const score141 = JSON.parse(blobAt(PRODUCT_COMMIT, SCORE141_PATH, SCORE141_BLOB).toString("utf8"));
const rgbManifestId = git(["rev-parse", `${PRODUCT_COMMIT}:${RGB_MANIFEST_PATH}`]).trim();
const rgbManifest = JSON.parse(blobAt(PRODUCT_COMMIT, RGB_MANIFEST_PATH).toString("utf8")).images;

const inputCheck = JSON.parse(readFileSync(join(run, "input-check.json"), "utf8"));
const ids = Object.keys(inputCheck.images);
if (ids.length !== 48) throw new Error(`expected 48 ids in input-check.json, got ${ids.length}`);
validateGold(gold, ids);
const rows = readFileSync(join(run, "raw.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const want = new Set(PADDINGS.flatMap((p) => ids.map((id) => `p${p}|${id}`)));
const got = rows.map((r) => r.key);
if (got.length !== want.size || new Set(got).size !== want.size || got.some((k) => !want.has(k))) throw new Error(`expected exactly ${want.size} keys`);
const conditions = readFileSync(join(run, "conditions.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ---------------------------------------------------------------- rows
const scored = rows.map((r) => {
  const g = gold[r.id];
  if (g.page.width !== r.page.width || g.page.height !== r.page.height) throw new Error(`gold page of ${r.id} differs from the run page`);
  const j = judgeRow(r, g.parts, g.page);
  return { ...r, judgement: j.judgement, missing: j.missing, missingItems: j.missingItems, area: areaOf(r, g.page), assumedArea: assumedAreaOf(r, g.page) };
});
const perRow = scored.map((r) => ({
  key: r.key, p: r.p, id: r.id, intent: r.intent, requestFull: r.requestFull, requestRect: r.requestRect, clip: r.clip,
  outcome: r.outcome, failCode: r.failCode, returnedKind: r.returned.kind, returnedRegion: r.returned.region,
  judgement: r.judgement, missing: r.missing, missingItems: r.missingItems, area: r.area, assumedArea: r.assumedArea,
}));
const agg = aggregate(scored, PADDINGS);

// ---------------------------------------------------------------- #141 replay at p = 0
const old = raw141.filter((r) => r.key.startsWith("rgb|tolerant|region|"));
const oldJudge = Object.fromEntries(score141.perRow.filter((p) => p.key.startsWith("rgb|tolerant|region|")).map((p) => [p.key, p.geometry]));
const rgbDims = Object.fromEntries(ids.map((id) => [id, { width: rgbManifest[id]?.width, height: rgbManifest[id]?.height }]));
const replay = compare141(scored.filter((r) => r.p === 0), old, oldJudge, rgbDims);
const provenance = ids.filter((id) => rgbManifest[id]?.originalSha256 !== inputCheck.images[id].originalSha256);
if (provenance.length) replay.mismatches.push({ id: null, field: "rgb_derivation_source", was: provenance, now: null });
replay.pass = replay.mismatches.length === 0;
replay.status = replay.pass ? "replayed" : "not_directly_comparable";
replay.sources = { raw141: RAW141_BLOB, score141: SCORE141_BLOB, rgbManifest: rgbManifestId, oldRows: old.length, oldKinds: count(old, (r) => r.returned.kind) };

function count(rs, f) { const o = {}; for (const r of rs) o[f(r)] = (o[f(r)] || 0) + 1; return Object.fromEntries(Object.entries(o).sort()); }

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.json"), `${JSON.stringify({
  product: PRODUCT_COMMIT, base: BASE_COMMIT, goldBlob: GOLD_BLOB, evidence: evidence.files, keys: rows.length, paddings: PADDINGS,
  measured: "geometric containment and delivered area in original source pixels; readability, accuracy, tokens and time not measured",
  replay141: replay, perRow, aggregate: agg,
  conditions: conditions.map((c) => ({ p: c.p, initialize: c.initialize, mcpRequests: c.mcpRequests, mcpResponses: c.mcpResponses, notifications: c.notifications, toolCalls: c.toolCalls, exit: c.exit, stderrBytes: c.stderrBytes })),
}, null, 1)}\n`);

// ---------------------------------------------------------------- summary.md (display rounding only)
const f4 = (x) => (x === null ? "-" : x.toFixed(4));
const f2 = (x) => (x === null ? "-" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}`);
const L = [];
L.push("# 고정 자르기 여백 재생: 집계", "");
L.push(`- 제품 ${PRODUCT_COMMIT.slice(0, 7)}, 입력 기준 ${BASE_COMMIT.slice(0, 7)}. 키 ${rows.length}개(p 4개 × 48). 기하적 포함과 전달 면적만 잰다`);
L.push("- p마다 분모 전체 48, 매치 36, 미매치 12. 실패 행도 분모에 남는다. 면적비는 표시할 때만 반올림한다", "");
L.push(`## #141 재생 대조 (p = 0): ${replay.pass ? "통과" : "불일치 — p > 0은 기존 실험과 직접 비교 불가"}`, "");
L.push(`- 대조 행 ${replay.rows}, 불일치 ${replay.mismatches.length}`);
for (const m of replay.mismatches) L.push(`  - \`${m.id}\` ${m.field}: ${JSON.stringify(m.was)} → ${JSON.stringify(m.now)}`);
L.push("", "## 판정과 반환", "", "| p | 성공/실패 | 전체 complete/incomplete/평가불가 | 매치(36) | 미매치(12) | 부분 JPEG | 원본(검증) | 매치→전체 페이지 | 한도 초과 | 실패 코드 |", "|---|---|---|---|---|---|---|---|---|---|");
const jt = (j) => JUDGEMENTS.map((k) => j[k]).join("/");
for (const p of PADDINGS) {
  const a = agg.byP[p];
  const codes = Object.entries(a.failCodes).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  L.push(`| ${p} | ${a.outcomes.ok}/${a.outcomes.failed} | ${jt(a.judgement)} | ${jt(a.byIntent.matched.judgement)} | ${jt(a.byIntent.unmatched.judgement)} | ${a.returned.crop_jpeg} | ${a.returned.original_verified} | ${a.matchedFullPage} | ${a.limitExceeded} | ${codes} |`);
}
L.push("", "## 면적비 (반환 폭×높이 / 원본 폭×높이)", "", "| p | 전체 평균(유효/결측) | 매치 평균(유효/결측) | p0 대비 전체 pp(유효 쌍/결측 쌍) | p0 대비 매치 pp(유효 쌍/결측 쌍) |", "|---|---|---|---|---|");
for (const p of PADDINGS) {
  const a = agg.byP[p];
  L.push(`| ${p} | ${f4(a.area.all.mean)} (${a.area.all.valid}/${a.area.all.missing}) | ${f4(a.area.matched.mean)} (${a.area.matched.valid}/${a.area.matched.missing}) | ${f2(a.pairedVsP0.all.meanPp)} (${a.pairedVsP0.all.validPairs}/${a.pairedVsP0.all.missingPairs}) | ${f2(a.pairedVsP0.matched.meanPp)} (${a.pairedVsP0.matched.validPairs}/${a.pairedVsP0.matched.missingPairs}) |`);
}
L.push("", "한도 초과 민감도(가정치: 한도 초과 행에 요청 면적 대입, 그 밖의 실패는 결측):", "", "| p | 전체 평균(유효/결측) | 매치 평균(유효/결측) |", "|---|---|---|");
for (const p of PADDINGS) {
  const a = agg.byP[p];
  L.push(`| ${p} | ${f4(a.assumedArea.all.mean)} (${a.assumedArea.all.valid}/${a.assumedArea.all.missing}) | ${f4(a.assumedArea.matched.mean)} (${a.assumedArea.matched.valid}/${a.assumedArea.matched.missing}) |`);
}
L.push("", "## p0 대비 판정 변화 (같은 ID)", "", "| p | 회복 | 악화 | 유지 complete | 유지 incomplete | 한쪽 평가불가 쌍 |", "|---|---|---|---|---|---|");
for (const p of PADDINGS) {
  const c = agg.byP[p].changeVsP0;
  L.push(`| ${p} | ${c.recovered} | ${c.worsened} | ${c.keptComplete} | ${c.keptIncomplete} | ${c.notEvaluablePairs} |`);
}
L.push("", "## 언어 × 앵커 (각 12, complete/incomplete/평가불가)와 24쌍", "", "| p | en·code | ko·code | en·nl | ko·nl | 짝 both/EN만/KO만/neither |", "|---|---|---|---|---|---|");
for (const p of PADDINGS) {
  const a = agg.byP[p];
  const la = (k) => { const x = a.byLangAnchor[k]; return x ? jt(x) : "-"; };
  L.push(`| ${p} | ${la("en|code")} | ${la("ko|code")} | ${la("en|nl")} | ${la("ko|nl")} | ${a.pairs.both}/${a.pairs.enOnly}/${a.pairs.koOnly}/${a.pairs.neither} |`);
}
L.push("", "## incomplete 행", "");
const inc = perRow.filter((r) => r.judgement === "incomplete");
if (!inc.length) L.push("- 없음");
for (const r of inc) L.push(`- \`${r.key}\`: 빠진 항목 ${r.missingItems.join(", ")}, 반환 ${JSON.stringify(r.returnedRegion)}`);
L.push("", "## 조건 호출", "", "| p | initialize | MCP 요청/응답 | 알림 | tools/call | 종료 |", "|---|---|---|---|---|---|");
for (const c of conditions) L.push(`| ${c.p} | ${c.initialize} | ${c.mcpRequests}/${c.mcpResponses} | ${c.notifications} | ${c.toolCalls} | ${c.exit.code ?? "-"}/${c.exit.signal ?? "-"} |`);
writeFileSync(join(out, "summary.md"), `${L.join("\n")}\n`);
console.log(`scored ${rows.length} keys; replay ${replay.status}`);
