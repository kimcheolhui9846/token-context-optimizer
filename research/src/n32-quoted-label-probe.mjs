// N-32 pre-design probe: credential labels wrapped in quotes or parentheses
// ("password": x, 'token': x, (password): x, "비밀번호": x) in classifyContext.
//
// Loads the BUILT product classifier (run `npm run build` in the checkout
// first) and reports, for candidate tuple-#0 predicates:
//   1. current mode and overlay-predicted mode for label x form, alone and in a sentence
//   2. hand-written exposure / over-protection / must-not-match sentences
//   3. impact on tracked Markdown in the checkout (lines and paragraphs)
//   4. how many rows of the frozen N-27 literal matrix (tests/policy-n27.test.ts) change
//   5. predicate-alone time on ~10 MiB near-miss inputs, current vs candidate
//      (informational only; an implementation needs its own performance gate)
//
// Usage: node research/src/n32-quoted-label-probe.mjs <checkout-with-dist> [--out <file>]
// Candidate predicates are defined here only; they are not product code.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? ".");
const outIndex = process.argv.indexOf("--out");
const outFile = outIndex > 0 ? process.argv[outIndex + 1] : null;
const { classifyContext } = await import(pathToFileURL(resolve(checkout, "dist/src/core/policy.js")).href);
const policySource = readFileSync(resolve(checkout, "src/core/policy.ts"), "utf8").replace(/\r\n/g, "\n");

// Current (post N-27/N-30) tuple-#0 regex sources, copied from src/core/policy.ts and checked below.
const EN0 = String.raw`api[_-]?key|token|password|secret|private[_-]?key`;
const E3 = String.raw`passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?`;
const KO = String.raw`비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드`;
const KOAPI_LB = String.raw`(?<![A-Za-z0-9])`;
const KOAPI = String.raw`api[ \t]?키`;
const SEP = String.raw`\s*[:=：]`;

const current = {
  en0: new RegExp(String.raw`\b(?:${EN0})\b\*{0,3}${SEP}`, "iu"),
  e3: new RegExp(String.raw`\b(?:${E3})\b\*{0,3}${SEP}`, "i"),
  ko: new RegExp(String.raw`(?:${KO})\*{0,3}${SEP}`, "i"),
  koApi: new RegExp(String.raw`${KOAPI_LB}${KOAPI}\*{0,3}${SEP}`, "i"),
};
for (const [name, re] of Object.entries(current)) {
  if (!policySource.includes(re.source)) throw new Error(`policy.ts no longer contains current ${name} regex: ${re.source}`);
}
const currentPredicate = (s) => current.en0.test(s) || current.e3.test(s) || current.ko.test(s) || current.koApi.test(s);

// Candidates. All keep the label lists, flags, tuple position and left boundaries,
// and are edited in place (no new regex ORed in). They differ only in what may sit
// between the label and the optional whitespace before the separator.
//   U*: one unpaired closing character after the label (opening side not checked)
//   P*: a paired wrapper as an extra alternative inside the same regex
//   L*: U-style closer accepted only when a lookbehind finds the matching opener
const CLOSE_U1 = String.raw`["']`;
const CLOSE_U2 = String.raw`["')]`;
const CLOSE_U3 = String.raw`["')”’）」』]`;
const PAIRS_P2 = [['"', '"'], ["'", "'"], [String.raw`\(`, String.raw`\)`]];
const PAIRS_P3 = [...PAIRS_P2, ["“", "”"], ["‘", "’"], ["（", "）"], ["「", "」"], ["『", "』"]];

function unpaired(close) {
  const tail = String.raw`(?:\*{1,3}|${close})?${SEP}`;
  return [
    new RegExp(String.raw`\b(?:${EN0})\b${tail}`, "iu"),
    new RegExp(String.raw`\b(?:${E3})\b${tail}`, "i"),
    new RegExp(String.raw`(?:${KO})${tail}`, "i"),
    new RegExp(String.raw`${KOAPI_LB}${KOAPI}${tail}`, "i"),
  ];
}
function paired(pairs) {
  const wrap = (labels) => pairs.map(([o, c]) => `${o}(?:${labels})${c}`).join("|");
  return [
    new RegExp(String.raw`(?:\b(?:${EN0})\b\*{0,3}|${wrap(EN0)})${SEP}`, "iu"),
    new RegExp(String.raw`(?:\b(?:${E3})\b\*{0,3}|${wrap(E3)})${SEP}`, "i"),
    new RegExp(String.raw`(?:(?:${KO})\*{0,3}|${wrap(KO)})${SEP}`, "i"),
    new RegExp(String.raw`(?:${KOAPI_LB}${KOAPI}\*{0,3}|${wrap(KOAPI)})${SEP}`, "i"),
  ];
}
// L*: same label-first scan as U, but each closing character is accepted only when a
// lookbehind finds the matching opening character directly before the label
// (suggested in the Codex cross-review of PR #98).
function pairedAfter(pairs) {
  const tail = (labels) => String.raw`(?:\*{1,3}|${pairs.map(([o, c]) => `${c}(?<=${o}(?:${labels})${c})`).join("|")})?${SEP}`;
  return [
    new RegExp(String.raw`\b(?:${EN0})\b${tail(EN0)}`, "iu"),
    new RegExp(String.raw`\b(?:${E3})\b${tail(E3)}`, "i"),
    new RegExp(String.raw`(?:${KO})${tail(KO)}`, "i"),
    new RegExp(String.raw`${KOAPI_LB}${KOAPI}${tail(KOAPI)}`, "i"),
  ];
}
function candidate(id, description, res) {
  return { id, description, sources: res.map((r) => `/${r.source}/${r.flags}`), test: (s) => res.some((r) => r.test(s)) };
}
const candidates = [
  candidate("U1", "one unpaired closing ASCII quote (\" or ') after the label", unpaired(CLOSE_U1)),
  candidate("U2", "U1 + closing ASCII parenthesis", unpaired(CLOSE_U2)),
  candidate("U3", "U2 + closing curly quotes, fullwidth parenthesis, CJK corner brackets", unpaired(CLOSE_U3)),
  candidate("P2", "paired \"x\" / 'x' / (x) as an extra alternative in each regex", paired(PAIRS_P2)),
  candidate("P3", "P2 + paired curly quotes, fullwidth parenthesis, CJK corner brackets", paired(PAIRS_P3)),
  candidate("L2", "U2 closers, each accepted only after a lookbehind finds the matching opener before the label", pairedAfter(PAIRS_P2)),
  candidate("L3", "U3 closers, each accepted only after a lookbehind finds the matching opener before the label", pairedAfter(PAIRS_P3)),
];

// Overlay: tuple #0 is first, so a non-exact result becomes exact ["secret"];
// an exact result without "secret" gains "secret" in front.
function overlay(text, cand) {
  const cur = classifyContext(text);
  const oldHit = currentPredicate(text);
  const newHit = cand.test(text);
  if (oldHit && !newHit) throw new Error(`candidate ${cand.id} lost a current positive: ${JSON.stringify(text)}`);
  if (oldHit && cur.mode === "exact" && cur.reasons[0] !== "secret" && !cur.reasons.includes("classification_resource_limit")) {
    throw new Error(`overlay assumption broken (secret not first): ${JSON.stringify(text)}`);
  }
  if (!newHit || oldHit) return { mode: cur.mode, reasons: cur.reasons, changed: false };
  const reasons = cur.mode === "exact" ? ["secret", ...cur.reasons.filter((r) => r !== "secret")] : ["secret"];
  return { mode: "exact", reasons, changed: cur.mode !== "exact" || JSON.stringify(reasons) !== JSON.stringify(cur.reasons) };
}

const report = {
  schema: "n32-quoted-label-probe/v2",
  policySha256Lf: createHash("sha256").update(policySource).digest("hex"),
  head: execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  candidates: candidates.map(({ id, description, sources }) => ({ id, description, sources })),
};

// 1. label x form matrix. The first 18 forms are the N-27 matrix forms (same order).
const enSentence = (x) => `Guest wifi ${x} hunter2 is taped under the desk for visitors.`;
const koSentence = (x) => `회의실 ${x} hunter2 이니까 접속할 때 참고해 주세요.`;
const enLabels = ["password", "Password", "api key", "API_KEY", "token", "secret", "passphrase", "pass", "recovery codes", "client secret"];
const koLabels = ["비밀번호", "암호", "API 키"];
const n27Forms = [
  ["plain-colon", (l) => `${l}:`], ["fullwidth-colon", (l) => `${l}：`], ["space-fullwidth", (l) => `${l} ：`],
  ["bold-out", (l) => `**${l}**:`], ["bold-in", (l) => `**${l}:**`], ["bold-out-fw", (l) => `**${l}**：`],
  ["italic-star", (l) => `*${l}*:`], ["bold-italic", (l) => `***${l}***:`], ["bold-space", (l) => `**${l}** :`],
  ["bold-us", (l) => `__${l}__:`], ["italic-us", (l) => `_${l}_:`], ["strike", (l) => `~~${l}~~:`],
  ["code-span", (l) => `\`${l}\`:`], ["dquote", (l) => `"${l}":`], ["squote", (l) => `'${l}':`], ["paren", (l) => `(${l}):`],
  ["bracket", (l) => `[${l}]:`], ["equals-bold", (l) => `**${l}**=`],
];
const extraForms = [
  ["dquote-space", (l) => `"${l}" :`], ["dquote-fw", (l) => `"${l}"：`], ["dquote-equals", (l) => `"${l}"=`],
  ["json-open", (l) => `{"${l}":`], ["dquote-bold", (l) => `**"${l}"**:`], ["paren-fw", (l) => `(${l})：`],
  ["curly-dquote", (l) => `“${l}”:`], ["curly-squote", (l) => `‘${l}’:`],
  ["fw-paren", (l) => `（${l}）:`], ["corner", (l) => `「${l}」:`], ["double-corner", (l) => `『${l}』:`],
  ["dquote-unopened", (l) => `${l}":`], ["paren-unopened", (l) => `${l}):`],
];
const forms = [...n27Forms, ...extraForms];
report.matrix = [];
for (const [lang, labels, sentence] of [["en", enLabels, enSentence], ["ko", koLabels, koSentence]]) {
  for (const label of labels) {
    for (const [form, make] of forms) {
      const token = make(label);
      const row = { lang, label, form, token, alone: classifyContext(`${token} hunter2`).mode, inSentence: classifyContext(sentence(token)).mode, predicted: {}, predictedAlone: {} };
      for (const c of candidates) {
        row.predicted[c.id] = overlay(sentence(token), c).mode;
        row.predictedAlone[c.id] = overlay(`${token} hunter2`, c).mode;
      }
      report.matrix.push(row);
    }
  }
}

// 2. hand-written sentences
const sentences = {
  exposure: [
    "The \"password\": \"hunter2\" pair was pasted into the chat by mistake.",
    "Use the 'token': 'abc-live-77' value only while testing locally please.",
    "Enter the code (passcode): hunter2 at the front door tonight.",
    "The “password”: hunter2 line was left in the email body.",
    "I sent {\"api_key\": \"sk-test-123\"} to the vendor support thread yesterday.",
    "회의실 \"비밀번호\": \"hunter2\" 이니까 접속할 때 참고해 주세요.",
    "회의실 (비밀번호): hunter2 이니까 접속할 때 참고해 주세요.",
    "회의실 「비밀번호」: hunter2 이니까 접속할 때 참고해 주세요.",
    "회의실 （비밀번호）：hunter2 이니까 접속할 때 참고해 주세요.",
  ],
  overProtection: [
    "The \"token\": field in the response describes how billing is counted.",
    "Each \"secret\": entry in the config schema is optional for now.",
    "We call this the (token): the smallest unit the model reads at once.",
    "He whispered 'I forgot my password': then he left the room quietly.",
    "Type it again (your password): the form will remember the rest.",
    "응답의 \"토큰\": 항목은 과금 방식을 설명하는 필드입니다.",
    "Results were \"pass\": yes and \"fail\": no for this run.",
    "Set \"token\": null when the user logs out of the app.",
  ],
  mustNotMatch: [
    "The \"password manager\" app keeps every login safe across devices.",
    "The \"token-based\": approach scales better for many clients.",
    "A \"passport\": issued by the state department for travel abroad.",
    "Our \"passwords\": rotate them every ninety days according to policy.",
    "The (token bucket): a classic rate limiter for public endpoints.",
    "It's the password's owner who must rotate it, not the admin team.",
    "The \"secret sauce\": always test with real data before release.",
    "The **password manager** keeps every login safe across your devices.",
    "Use a **token-based** approach: it scales better for many clients.",
    "We stored it in my__password__: wait, that name was never used here.",
    "The password_hash: value is computed on the server and never shown.",
    "Remember this **secret** of the trade: always test with real data.",
    "The **token-based** flow: every client refreshes its session hourly.",
    "A **passport**: issued by the state department for travel abroad.",
    "Our **passwords**: rotate them every ninety days according to policy.",
    "**Secret Santa**: draw names at the party and keep them to yourself.",
  ],
};
report.sentences = {};
for (const [group, list] of Object.entries(sentences)) {
  report.sentences[group] = list.map((text) => ({
    text, current: classifyContext(text).mode,
    predicted: Object.fromEntries(candidates.map((c) => [c.id, overlay(text, c).mode])),
    predicateHit: Object.fromEntries([["current", currentPredicate(text)], ...candidates.map((c) => [c.id, c.test(text)])]),
  }));
}

// 3. tracked Markdown in the checkout
const files = execFileSync("git", ["-C", checkout, "ls-files", "*.md"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const units = new Map();
for (const f of files) {
  const text = readFileSync(resolve(checkout, f), "utf8").replace(/\r\n/g, "\n");
  // Keep every source file of a unit so plan/handoff exclusion does not depend on file order.
  const add = (key, kind, unitText) => {
    const u = units.get(key) ?? { files: new Set(), kind, text: unitText };
    u.files.add(f);
    units.set(key, u);
  };
  for (const line of text.split("\n")) if (line.trim()) add(`L\0${line}`, "line", line);
  for (const para of text.split(/\n\s*\n/)) if (para.trim()) add(`P\0${para}`, "paragraph", para);
}
const planSource = (f) => /^(?:research\/plans|docs\/agent\/handoffs)\//.test(f);
report.corpus = { files: files.length, uniqueUnits: units.size, byCandidate: {} };
for (const c of candidates) {
  const transitions = {};
  const transitionsExcludingPlans = {};
  let mixedSourceUnits = 0;
  const examples = [];
  let newHits = 0;
  for (const u of units.values()) {
    if (!c.test(u.text) || currentPredicate(u.text)) continue;
    newHits += 1;
    const cur = classifyContext(u.text);
    const pred = overlay(u.text, c);
    const key = `${cur.mode}->${pred.mode}${pred.changed && cur.mode === "exact" ? " (reasons)" : ""}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
    const unitFiles = [...u.files].sort();
    const nonPlan = unitFiles.filter((f) => !planSource(f));
    if (nonPlan.length > 0) transitionsExcludingPlans[key] = (transitionsExcludingPlans[key] ?? 0) + 1;
    if (nonPlan.length > 0 && nonPlan.length < unitFiles.length) mixedSourceUnits += 1;
    if (examples.length < 15) examples.push({ files: unitFiles, kind: u.kind, from: cur.mode, text: u.text.slice(0, 160) });
  }
  report.corpus.byCandidate[c.id] = { newHits, transitions, transitionsExcludingPlans, mixedSourceUnits, examples };
}

// 4. frozen N-27 literal matrix rows (first 18 forms) whose output would change
report.n27MatrixChanges = {};
for (const c of candidates) {
  const changed = [];
  for (const row of report.matrix) {
    if (!n27Forms.some(([f]) => f === row.form)) continue;
    for (const [placement, before, after] of [["standalone", row.alone, row.predictedAlone[c.id]], ["sentence", row.inSentence, row.predicted[c.id]]]) {
      const text = placement === "standalone" ? `${row.token} hunter2` : (row.lang === "en" ? enSentence : koSentence)(row.token);
      if (overlay(text, c).changed) changed.push(`${row.lang}/${row.label}/${row.form}/${placement}:${before}->${after}`);
    }
  }
  report.n27MatrixChanges[c.id] = { count: changed.length, rows: changed };
}

// 5. predicate-alone time (informational)
const MiB10 = 10 * 1024 * 1024;
function fill(unit) {
  const unitBytes = Buffer.byteLength(unit);
  const n = Math.floor(MiB10 / unitBytes);
  return unit.repeat(n) + " ".repeat(MiB10 - n * unitBytes);
}
const timingInputs = {
  "label-space": fill("password "),
  "dq-label-space": fill("\"password\" "),
  "sq-label-space": fill("'password' "),
  "paren-label-space": fill("(password) "),
  "dq-label-nbsp60": fill("\"password\"" + " ".repeat(60) + " "),
  "dq-label-nbsp8": fill("\"password\"" + " ".repeat(8)),
  "dq-label-wide8": fill("\"password\"" + "　".repeat(8)),
  "bold-nbsp60": fill("**password**" + " ".repeat(60)),
  "dq-run": fill("\"".repeat(63) + " "),
  "paren-run": fill("(".repeat(31) + ")".repeat(32) + " "),
  "json-like": fill("{\"tokenizer\": \"bpe\", \"pass_rate\": \"0.9\"} "),
  "en-prose": fill("The quick brown fox reviewed the deployment notes before the weekly sync meeting. "),
  "ko-dq-label": fill("\"비밀번호\" "),
  "ko-dq-nbsp8": fill("\"비밀번호\"" + " ".repeat(8)),
  "ko-corner-nbsp8": fill("「비밀번호」" + " ".repeat(8)),
  "ko-api-dq-nbsp8": fill("\"api키\"" + " ".repeat(8)),
};
function median(xs) { const s = [...xs].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; }
// Nine rounds per input. Within a round every function runs once; the order is
// reversed on odd rounds so no function always runs first or last.
function timeAll(fns, input) {
  const samples = Object.fromEntries(Object.keys(fns).map((k) => [k, []]));
  const order = Object.keys(fns);
  for (let round = 0; round < 9; round += 1) {
    for (const k of round % 2 === 0 ? order : [...order].reverse()) {
      const t0 = process.hrtime.bigint();
      if (fns[k](input)) throw new Error(`timing input unexpectedly matched: ${k}`);
      samples[k].push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([k, xs]) => [k, Math.round(median(xs) * 10) / 10]));
}
report.timingMsMedianOf9 = {};
for (const [name, input] of Object.entries(timingInputs)) {
  const fns = { current: currentPredicate, ...Object.fromEntries(candidates.map((c) => [c.id, c.test])) };
  const classifyCurrentMs = timeAll({ classify: (x) => (classifyContext(x), false) }, input).classify;
  report.timingMsMedianOf9[name] = { bytes: Buffer.byteLength(input), classifyCurrentMs, ...timeAll(fns, input) };
}

const json = JSON.stringify(report, null, 2) + "\n";
if (outFile) writeFileSync(outFile, json);
else process.stdout.write(json);
