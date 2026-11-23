// Product MCP view comparison scorer (protocol section 8). The only step that reads gold boxes. Usage:
//   node src/mcp-view-comparison-score.mjs --run <run dir> --evidence <evidence.json> --out <new dir>
// Checks the frozen evidence hashes first, then reads the base-commit gold and design blobs from Git.
// Writes score.json and summary.md (deterministic for identical inputs). Geometry only; readability is not measured.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE_COMMIT, CELLS, EVIDENCE_FILES, GEOMETRY, RETURNED_KINDS, aggregate, cellOf, checkDenominator, judgeGeometry, sha256 } from "./mcp-view-comparison-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const run = arg("--run");
const evidenceFile = arg("--evidence");
const out = arg("--out");
if (!run || !evidenceFile || !out) throw new Error("--run, --evidence and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);

const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
if (Object.keys(evidence.files ?? {}).sort().join() !== EVIDENCE_FILES.slice().sort().join()) throw new Error(`evidence must list exactly ${EVIDENCE_FILES.join(", ")}`);
for (const [f, h] of Object.entries(evidence.files)) if (sha256(readFileSync(join(run, f))) !== h) throw new Error(`evidence ${f} changed after freezing`);

const H = "research/results/r09-bilingual/heldout";
const git = (args, enc = "utf8") => execFileSync("git", args, { encoding: enc, maxBuffer: 64 * 1024 * 1024 });
const blob = (path) => git(["cat-file", "blob", git(["rev-parse", `${BASE_COMMIT}:${path}`]).trim()], "buffer");
const freeze = JSON.parse(blob(`${H}/freeze-manifest.json`).toString("utf8"));
const goldBytes = blob(`${H}/gold.json`);
if (sha256(goldBytes) !== freeze.inputs["gold.json"]) throw new Error("gold differs from its freeze manifest");
const gold = JSON.parse(goldBytes.toString("utf8")).gold;

const rows = readFileSync(join(run, "raw.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
// The id set comes from the frozen input check, not from the rows, so an id missing in every cell is caught.
const ids = Object.keys(JSON.parse(readFileSync(join(run, "input-check.json"), "utf8")).images);
checkDenominator(rows.map((r) => r.key), ids);
const cells = readFileSync(join(run, "cells.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const perRow = rows.map((r) => {
  const g = gold[r.id];
  const j = judgeGeometry(r, g.parts.map((p) => p.rect), g.page);
  const missingItems = j.geometry === "partial" ? g.parts.filter((p) => !(p.rect[0] >= r.returned.region[0] && p.rect[1] >= r.returned.region[1] && p.rect[2] <= r.returned.region[2] && p.rect[3] <= r.returned.region[3])).map((p) => p.item) : [];
  const area = r.returned.region ? ((r.returned.region[2] - r.returned.region[0]) * (r.returned.region[3] - r.returned.region[1])) / (g.page.width * g.page.height) : null;
  return { key: r.key, geometry: j.geometry, missing: j.missing, missingItems, areaRatio: area === null ? null : Math.round(area * 1e6) / 1e6 };
});
const scored = rows.map((r, i) => ({ ...r, geometry: perRow[i].geometry }));
const agg = aggregate(scored);
const cellCalls = Object.fromEntries(cells.map((c) => [c.cell, { initialize: c.initialize, mcpRequests: c.mcpRequests, mcpResponses: c.mcpResponses, notifications: c.notifications, initializeRequests: c.initializeRequests, toolsListRequests: c.toolsListRequests, toolCalls: c.toolCalls, exit: c.exit, stderrBytes: c.stderrBytes }]));

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.json"), `${JSON.stringify({ base: BASE_COMMIT, evidence: evidence.files, keys: rows.length, measured: "geometric containment in original source pixels; readability and model accuracy not measured", perRow, aggregate: agg, cellCalls }, null, 1)}\n`);

// ---------------------------------------------------------------- summary.md
const L = [];
L.push("# 제품 MCP 보기 비교: 집계", "");
L.push(`- 기준 ${BASE_COMMIT.slice(0, 7)}. 키 ${rows.length}개(셀 ${CELLS.length}개 × 48). 기하적 포함만 잰다. 판독성·정답률은 미측정`, "- 셀마다 분모 48. 실패 행도 분모에 남는다", "");
L.push("| 표현 | 프로필 | 보기 | 수락 | 성공 | 실패(코드) | 반환 종류 | 포함 complete/partial/평가불가 | tools/call | 파일 읽기 | 예정 원본 | 폴백 원본 | 참조 검증 |");
L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const { rep, profile, view } of CELLS) {
  const c = agg.cells[cellOf(rep, profile, view)];
  const codes = Object.entries(c.failCodes).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  const kinds = RETURNED_KINDS.filter((k) => c.returned[k]).map((k) => `${k} ${c.returned[k]}`).join(", ");
  L.push(`| ${rep} | ${profile} | ${view} | ${c.indexAccepted}/${c.n} | ${c.ok}/${c.n} | ${c.failed} (${codes}) | ${kinds} | ${GEOMETRY.map((g) => c.geometry[g]).join("/")} | ${c.counts.toolCalls} | ${c.counts.fileReads} | ${c.counts.plannedOriginalRequests} | ${c.counts.fallbackOriginalRequests} | ${c.counts.originalRefsRead} |`);
}
L.push("", "## 언어 × 앵커 (각 12)", "", "| 셀 | en·code | ko·code | en·nl | ko·nl | 짝 both/EN만/KO만/neither |", "|---|---|---|---|---|---|");
const la = (c, k) => { const x = c.byLangAnchor[k]; return `${x.complete}/${x.partial}/${x.not_evaluable}`; };
for (const { rep, profile, view } of CELLS) {
  const k = cellOf(rep, profile, view);
  const c = agg.cells[k];
  L.push(`| ${k} | ${la(c, "en|code")} | ${la(c, "ko|code")} | ${la(c, "en|nl")} | ${la(c, "ko|nl")} | ${c.pairs.both}/${c.pairs.enOnly}/${c.pairs.koOnly}/${c.pairs.neither} |`);
}
L.push("", "칸 값은 complete/partial/평가불가다.", "", "## 부분 누락 행", "");
const partial = perRow.filter((p) => p.geometry === "partial");
if (!partial.length) L.push("- 없음");
for (const p of partial) L.push(`- \`${p.key}\`: 빠진 항목 ${p.missingItems.join(", ")}, 면적비 ${p.areaRatio}`);
L.push("", "## 셀 호출", "", "| 셀 | initialize | MCP 요청/응답 | 알림 | tools/list | tools/call | 종료 |", "|---|---|---|---|---|---|---|");
for (const c of cells) L.push(`| ${c.cell} | ${c.initialize} | ${c.mcpRequests}/${c.mcpResponses} | ${c.notifications} | ${c.toolsListRequests} | ${c.toolCalls} | ${c.exit.code ?? "-"}/${c.exit.signal ?? "-"} |`);
writeFileSync(join(out, "summary.md"), `${L.join("\n")}\n`);
console.log(`scored ${rows.length} keys`);
