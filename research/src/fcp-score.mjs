// FCP scorer (protocol sections 8-9). The only step besides the recount that reads gold boxes. Usage:
//   node src/fcp-score.mjs --run <run dir> --frozen <frozen dir> --out <new dir>
// Checks the run's frozen evidence hashes first, then the committed freeze manifest, then reads oracle/gold.json
// (hash checked). Writes score.json (per row and aggregate) and summary.md (display rounding only).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PADDINGS, RUN_EVIDENCE_FILES, padRequest, sha256 } from "./fcp-lib.mjs";
import { committedFile } from "./fcp-inputs.mjs";
import { aggregate, areaOf, judgeRow, validateGold } from "./fcp-score-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [run, frozen, out] = ["--run", "--frozen", "--out"].map(arg);
const nonMeasurement = process.argv.includes("--non-measurement");
if (!run || !frozen || !out) throw new Error("--run, --frozen and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);

const evidence = JSON.parse(readFileSync(join(run, "evidence.json"), "utf8"));
if (Object.keys(evidence.files ?? {}).sort().join() !== RUN_EVIDENCE_FILES.slice().sort().join()) throw new Error(`evidence must list exactly ${RUN_EVIDENCE_FILES.join(", ")}`);
for (const [f, h] of Object.entries(evidence.files)) if (sha256(readFileSync(join(run, f))) !== h) throw new Error(`evidence ${f} changed after freezing`);
const manifestPath = join(frozen, "freeze-manifest.json");
if (!committedFile(manifestPath).clean && !nonMeasurement) throw new Error("freeze-manifest.json is not committed unchanged at HEAD");
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8"));
const inputCheck = JSON.parse(readFileSync(join(run, "input-check.json"), "utf8"));
if (inputCheck.freezeManifestSha256 !== sha256(manifestBytes)) throw new Error("run was measured on another freeze manifest");
const goldBytes = readFileSync(join(frozen, "oracle", "gold.json"));
if (sha256(goldBytes) !== manifest.files["oracle/gold.json"]) throw new Error("gold differs from the freeze manifest");
const gold = JSON.parse(goldBytes.toString("utf8")).gold;

const ids = Object.keys(inputCheck.images);
if (ids.length !== 48) throw new Error(`expected 48 ids, got ${ids.length}`);
validateGold(gold, ids);
const rows = readFileSync(join(run, "raw.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const want = new Set(PADDINGS.flatMap((p) => ids.map((id) => `p${p}|${id}`)));
const got = rows.map((r) => r.key);
if (got.length !== want.size || new Set(got).size !== want.size || got.some((k) => !want.has(k))) throw new Error(`expected exactly ${want.size} keys`);
const callers = new Map(readFileSync(join(run, "caller.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((c) => [c.id, c]));
const guard = JSON.parse(readFileSync(join(run, "guard-summary.json"), "utf8"));
const conditions = readFileSync(join(run, "conditions.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ---------------------------------------------------------------- rows
const scored = rows.map((r) => {
  const g = gold[r.id];
  if (g.page.width !== r.page.width || g.page.height !== r.page.height) throw new Error(`gold page of ${r.id} differs from the run page`);
  const again = padRequest(callers.get(r.id), r.page, r.p);
  if (again.intent !== r.intent || JSON.stringify(again.requestRect) !== JSON.stringify(r.requestRect)) throw new Error(`${r.key}: request does not follow from caller.jsonl`);
  const j = judgeRow(r, g.parts, g.page);
  return { ...r, state: j.state, small: j.small, preserved: j.preserved, missingItems: j.missingItems, area: areaOf(r, g.page) };
});
const perRow = scored.map((r) => ({
  key: r.key, p: r.p, id: r.id, pairId: r.pairId, lang: r.lang, anchor: r.anchor, doctype: r.doctype, layout: r.layout,
  intent: r.intent, band: r.band, requestRect: r.requestRect, requestFull: r.requestFull, pad: r.pad, clip: r.clip,
  outcome: r.outcome, failStage: r.failStage, failCode: r.failCode, returnedKind: r.returned.kind, returnedRegion: r.returned.region,
  jpegSha256: r.crop.jpegSha256, jpegBytes: r.crop.jpegBytes, state: r.state, small: r.small, preserved: r.preserved, missingItems: r.missingItems, area: r.area,
}));
const agg = aggregate(scored, PADDINGS);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "score.json"), `${JSON.stringify({
  evidence: evidence.files, freezeManifestSha256: sha256(manifestBytes), goldSha256: sha256(goldBytes), keys: rows.length, paddings: PADDINGS,
  measured: "geometric containment of the two evidence ink boxes and delivered area in original source pixels; accuracy, tokens, cost and time not measured",
  instrumentDefect: guard.instrumentDefect, guard: { blocked: guard.blocked, stepsWithoutGuard: guard.stepsWithoutGuard },
  perRow, aggregate: agg,
  conditions: conditions.map((c) => ({ p: c.p, initialize: c.initialize, mcpRequests: c.mcpRequests, mcpResponses: c.mcpResponses, notifications: c.notifications, toolCalls: c.toolCalls, exit: c.exit, stderrBytes: c.stderrBytes })),
}, null, 1)}\n`);

// ---------------------------------------------------------------- summary.md
const pct = (x) => (x === null ? "N/A" : `${(x * 100).toFixed(2)}%`);
const f4 = (x) => (x === null ? "N/A" : x.toFixed(4));
const pp = (x) => (x === null ? "N/A" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}`);
const frac = (b) => `${b.success}/${b.denominator} (${pct(b.rate)})`;
const L = [];
L.push("# FCP 여백 0 대 4: 집계", "");
if (guard.instrumentDefect) L.push("> **계측 결함**: 가드 차단 또는 미적재 단계가 있다. 판정을 유보한다.", "");
L.push(`- 키 ${rows.length}개(p 2개 × 48). 기하적 포함과 전달 면적만 잰다. 분모 0은 N/A다. 비율은 표시할 때만 반올림한다`, "");
const p0 = agg.byP["0"];
L.push(`- 호출자 배정: 매치 ${p0.matchedDenominator}, 미매치 ${p0.unmatched}, 선택기 기술 오류 ${p0.callerErrors}`, "");
L.push("## 주 지표와 전체", "", "| p | 매치 중 작은 창 완전 포함(1) | 매치 상태 1/0/NE | 전체 48 작은 창 성공 | 전체 상태 1/0/NE | 전체 근거 보존(48) | 매치 근거 보존 |", "|---|---|---|---|---|---|---|");
const st = (s) => `${s[1]}/${s[0]}/${s.NE}`;
const pres = (b) => `${b.yes}/${b.denominator} (${pct(b.rate)}), NE ${b.NE}`;
for (const p of PADDINGS) {
  const a = agg.byP[p];
  L.push(`| ${p} | ${frac(a.primary)} | ${st(a.primary.states)} | ${frac(a.all)} | ${st(a.all.states)} | ${pres(a.preserved.all)} | ${pres(a.preserved.matched)} |`);
}
const ch = agg.change;
L.push("", `## 같은 ID의 0→4 변화`, "", "| 범위 | n | 개선 0→1 | 악화 1→0 | 유지 1 | 유지 0 | 한쪽 NE |", "|---|---|---|---|---|---|---|");
for (const [k, c] of [["매치", ch.matched], ["전체", ch.all]]) L.push(`| ${k} | ${c.n} | ${c.improved} | ${c.worsened} | ${c.kept1} | ${c.kept0} | ${c.notEvaluable} |`);
L.push("", "## 면적비 (반환 폭×높이 / 1280×960)", "", "| p | 전체 평균(유효/결측) | 매치 평균(유효/결측) |", "|---|---|---|");
for (const p of PADDINGS) {
  const a = agg.byP[p].area;
  L.push(`| ${p} | ${f4(a.all.mean)} (${a.all.valid}/${a.all.missing}) | ${f4(a.matched.mean)} (${a.matched.valid}/${a.matched.missing}) |`);
}
L.push("", `- 0→4 같은 ID 면적비 변화: 매치 ${pp(ch.areaMatched.meanPp)}%p (유효 쌍 ${ch.areaMatched.validPairs}, 결측 쌍 ${ch.areaMatched.missingPairs}), 전체 ${pp(ch.areaAll.meanPp)}%p (유효 쌍 ${ch.areaAll.validPairs}, 결측 쌍 ${ch.areaAll.missingPairs})`);
L.push("", "## 반환과 실패", "", "| p | 부분 JPEG | 원본(검증) | 없음 | 매치→전체 전환 | 미매치 원본 | 한도 초과 | 실패(단계|코드) |", "|---|---|---|---|---|---|---|---|");
for (const p of PADDINGS) {
  const a = agg.byP[p];
  const fails = Object.entries(a.failures).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  L.push(`| ${p} | ${a.returned.crop_jpeg} | ${a.returned.original_verified} | ${a.returned.none} | ${a.matchedFull} | ${a.unmatchedOriginal} | ${a.limitExceeded} | ${fails} |`);
}
L.push("", "## 층별 (n, 매치, 상태 1/0/NE, 근거 보존)", "");
for (const [name, key] of [["언어 × 앵커", "langAnchor"], ["문서형", "doctype"], ["레이아웃", "layout"]]) {
  L.push(`### ${name}`, "", "| 층 | p0 | p4 |", "|---|---|---|");
  for (const k of Object.keys(agg.byP["0"].strata[key])) {
    const cell = (p) => { const s = agg.byP[p].strata[key][k]; return `n ${s.n}, 매치 ${s.matched}, ${s.s1}/${s.s0}/${s.NE}, 보존 ${s.preserved}`; };
    L.push(`| ${k} | ${cell("0")} | ${cell("4")} |`);
  }
  L.push("");
}
L.push("## 한영 24쌍 (작은 창 성공 기준)", "", "| p | 둘 다 | EN만 | KO만 | 둘 다 아님 | 한쪽 NE |", "|---|---|---|---|---|---|");
for (const p of PADDINGS) { const t = agg.byP[p].pairs; L.push(`| ${p} | ${t.both} | ${t.enOnly} | ${t.koOnly} | ${t.neither} | ${t.withNE} |`); }
L.push("", "## 상태 0인 매치 행", "");
const zero = perRow.filter((r) => r.intent === "matched" && r.state === 0);
if (!zero.length) L.push("- 없음");
for (const r of zero) L.push(`- \`${r.key}\`: 반환 ${r.returnedKind} ${JSON.stringify(r.returnedRegion)}, 빠진 근거 ${r.missingItems.join(", ") || "-"}`);
L.push("", "## 조건 호출", "", "| p | initialize | MCP 요청/응답 | 알림 | tools/call | 종료 |", "|---|---|---|---|---|---|");
for (const c of conditions) L.push(`| ${c.p} | ${c.initialize} | ${c.mcpRequests}/${c.mcpResponses} | ${c.notifications} | ${c.toolCalls} | ${c.exit.code ?? "-"}/${c.exit.signal ?? "-"} |`);
writeFileSync(join(out, "summary.md"), `${L.join("\n")}\n`);
console.log(JSON.stringify({ keys: rows.length, matched: p0.matchedDenominator, p0: agg.byP["0"].primary, p4: agg.byP["4"].primary, change: agg.change.matched }));
