// N-27 / N-30 pre-design probe: English fullwidth-colon labels and
// Markdown-emphasis credential labels in classifyContext.
//
// Loads the BUILT product classifier (run `npm run build` in the checkout
// first) and reports, for candidate tuple-#0 predicates A-D:
//   1. current mode and overlay-predicted mode for label x form, alone and in a sentence
//   2. hand-written exposure / over-protection / must-not-match sentences
//   3. impact on tracked Markdown in the checkout (lines and paragraphs)
//   4. predicate-alone time on ~10 MiB near-miss inputs, current vs candidate
//      (informational only; an implementation needs its own performance gate)
//
// Section 4 also records the current full classifyContext time per input so the
// predicate-alone deltas can be read as a rough share of one classification.
//
// Usage: node research/src/n27-n30-credential-probe.mjs <checkout-with-dist> [--out <file>]
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

// Current tuple-#0 regex sources, copied from src/core/policy.ts and checked below.
const EN0 = String.raw`api[_-]?key|token|password|secret|private[_-]?key`;
const E3 = String.raw`passwd|pwd|passphrase|pass|passcode|pass(?:[ \t]+|-)phrase|credentials?|(?:private|secret|access|api)(?:[ \t]+|-)key|client(?:[ \t]+|-)secret|recovery(?:[ \t]+|-)codes?|secret(?:[ \t]+|-)answer|backup(?:[ \t]+|-)codes?`;
const KO = String.raw`비밀[ \t]?번호|비번|패스[ \t]?워드|인증[ \t]?키|개인[ \t]?키|비밀[ \t]?키|시크릿[ \t]?키|액세스[ \t]?키|복구[ \t]?코드|백업[ \t]?코드|인증[ \t]?토큰|접근[ \t]?토큰|액세스[ \t]?토큰|암호|토큰|보안[ \t]?코드`;
const KOAPI = String.raw`(?<![A-Za-z0-9])api[ \t]?키`;

const current = {
  en0: new RegExp(String.raw`\b(?:${EN0})\b\s*[:=]`, "iu"),
  e3: new RegExp(String.raw`\b(?:${E3})\b\s*[:=]`, "i"),
  ko: new RegExp(String.raw`(?:${KO})\s*[:=：]`, "i"),
  koApi: new RegExp(String.raw`${KOAPI}\s*[:=：]`, "i"),
};
for (const [name, re] of Object.entries(current)) {
  if (!policySource.includes(re.source)) throw new Error(`policy.ts no longer contains current ${name} regex: ${re.source}`);
}
const currentPredicate = (s) => current.en0.test(s) || current.e3.test(s) || current.ko.test(s) || current.koApi.test(s);

// Candidate builders. Each candidate keeps the label lists, flags and tuple position;
// only the text between label and separator, the separator set and (C, D) the
// English left boundary change.
const SEP_FW = "[:=：]";
function english(labels, flags, { left = String.raw`\b`, close = String.raw`\b` }) {
  return new RegExp(String.raw`${left}(?:${labels})${close}\s*${SEP_FW}`, flags);
}
function korean(labels, close) {
  return new RegExp(String.raw`(?:${labels})${close}\s*${SEP_FW}`, "i");
}
// C/D underscore emphasis: allow a leading __/_ only when that run itself starts a token.
const LEFT_US = String.raw`(?:\b|(?<=(?:^|[^A-Za-z0-9_])_{1,2}))`;
const CLOSE_STAR = String.raw`\b\*{0,3}`;
const CLOSE_STAR_US = String.raw`(?:\b\*{0,3}|_{1,2}(?![A-Za-z0-9_]))`;
const CLOSE_D = String.raw`(?:\b(?:\*{1,3}|["'”’)])?|_{1,2}(?![A-Za-z0-9_]))`;
const KO_STAR = String.raw`\*{0,3}`;
const KO_STAR_US = String.raw`(?:\*{0,3}|_{1,2})`;
const KO_D = String.raw`(?:\*{1,3}|_{1,2}|["'”’)])?`;

function candidate(id, description, en, ko, extra = []) {
  const res = [english(EN0, "iu", en), english(E3, "i", en), korean(KO, ko), korean(KOAPI, ko), ...extra];
  return { id, description, sources: res.map((r) => `/${r.source}/${r.flags}`), test: (s) => res.some((r) => r.test(s)), res };
}
const candidates = [
  candidate("A", "N-27 only: English #0 and E-3 accept fullwidth colon", {}, ""),
  candidate("B", "A + closing asterisk emphasis (0-3) between label and separator, English and Korean", { close: CLOSE_STAR }, KO_STAR),
  candidate("C", "B + underscore emphasis (_x_, __x__) with a narrow English left boundary", { left: LEFT_US, close: CLOSE_STAR_US }, KO_STAR_US),
  candidate("C2", "B + one separate underscore-emphasis regex that starts with a literal underscore (English and Korean)", { close: CLOSE_STAR }, KO_STAR, [
    new RegExp(String.raw`(?<![A-Za-z0-9_])_{1,2}(?:${EN0}|${E3}|${KO}|api[ \t]?키)_{1,2}\s*${SEP_FW}`, "i"),
  ]),
  candidate("D", "C + one closing quote or parenthesis (\"x\":, 'x':, (x):) — scope extension", { left: LEFT_US, close: CLOSE_D }, KO_D),
];

// Overlay: tuple #0 is first, so a non-exact result becomes exact ["secret"];
// an exact result without "secret" gains "secret" in front. Checked against
// the real classifier on every current positive below.
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
  schema: "n27-n30-credential-probe/v1",
  policySha256Lf: createHash("sha256").update(policySource).digest("hex"),
  head: execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  candidates: candidates.map(({ id, description, sources }) => ({ id, description, sources })),
};

// 1. label x form matrix
const enSentence = (x) => `Guest wifi ${x} hunter2 is taped under the desk for visitors.`;
const koSentence = (x) => `회의실 ${x} hunter2 이니까 접속할 때 참고해 주세요.`;
const enLabels = ["password", "Password", "api key", "API_KEY", "token", "secret", "passphrase", "pass", "recovery codes", "client secret"];
const koLabels = ["비밀번호", "암호", "API 키"];
const forms = [
  ["plain-colon", (l) => `${l}:`], ["fullwidth-colon", (l) => `${l}：`], ["space-fullwidth", (l) => `${l} ：`],
  ["bold-out", (l) => `**${l}**:`], ["bold-in", (l) => `**${l}:**`], ["bold-out-fw", (l) => `**${l}**：`],
  ["italic-star", (l) => `*${l}*:`], ["bold-italic", (l) => `***${l}***:`], ["bold-space", (l) => `**${l}** :`],
  ["bold-us", (l) => `__${l}__:`], ["italic-us", (l) => `_${l}_:`], ["strike", (l) => `~~${l}~~:`],
  ["code-span", (l) => `\`${l}\`:`], ["dquote", (l) => `"${l}":`], ["squote", (l) => `'${l}':`], ["paren", (l) => `(${l}):`],
  ["bracket", (l) => `[${l}]:`], ["equals-bold", (l) => `**${l}**=`],
];
report.matrix = [];
for (const [lang, labels, sentence] of [["en", enLabels, enSentence], ["ko", koLabels, koSentence]]) {
  for (const label of labels) {
    for (const [form, make] of forms) {
      const token = make(label);
      const row = { lang, label, form, token, alone: classifyContext(`${token} hunter2`).mode, inSentence: classifyContext(sentence(token)).mode, predicted: {} };
      for (const c of candidates) row.predicted[c.id] = overlay(sentence(token), c).mode;
      report.matrix.push(row);
    }
  }
}

// 2. hand-written sentences
const sentences = {
  exposure: [
    "Guest wifi password：hunter2 is taped under the desk for visitors.",
    "The **password**: hunter2 works for the shared printer account too.",
    "Please use the *api key*: sk-test-123 only in the staging environment.",
    "Remember that the __recovery code__: 4F7Q-PL2X is stored offline now.",
    "회의실 **비밀번호**: hunter2 이니까 접속할 때 참고해 주세요.",
    "The \"password\": \"hunter2\" pair was pasted into the chat by mistake.",
  ],
  overProtection: [
    "The **token**: a single unit of text that the model reads at once.",
    "**Password**: choose at least twelve characters and avoid common words.",
    "In this chapter the *secret*: is how the hero escapes the locked tower.",
    "The \"token\": field in the response describes how billing is counted.",
  ],
  mustNotMatch: [
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
  for (const line of text.split("\n")) if (line.trim()) units.set(`L\0${line}`, { f, kind: "line", text: line });
  for (const para of text.split(/\n\s*\n/)) if (para.trim()) units.set(`P\0${para}`, { f, kind: "paragraph", text: para });
}
report.corpus = { files: files.length, uniqueUnits: units.size, byCandidate: {} };
for (const c of candidates) {
  const transitions = {};
  const examples = [];
  let newHits = 0;
  for (const u of units.values()) {
    if (!c.test(u.text) || currentPredicate(u.text)) continue;
    newHits += 1;
    const cur = classifyContext(u.text);
    const pred = overlay(u.text, c);
    const key = `${cur.mode}->${pred.mode}${pred.changed && cur.mode === "exact" ? " (reasons)" : ""}`;
    transitions[key] = (transitions[key] ?? 0) + 1;
    if (examples.length < 12 && cur.mode !== "exact") examples.push({ file: u.f, kind: u.kind, from: cur.mode, text: u.text.slice(0, 160) });
  }
  report.corpus.byCandidate[c.id] = { newHits, transitions, examplesNotAlreadyExact: examples };
}

// 4. predicate-alone time (informational)
const MiB10 = 10 * 1024 * 1024;
function fill(unit) {
  const unitBytes = Buffer.byteLength(unit);
  const n = Math.floor(MiB10 / unitBytes);
  return unit.repeat(n) + " ".repeat(MiB10 - n * unitBytes);
}
const timingInputs = {
  "label-space": fill("password "),
  "bold-label-space": fill("**password** "),
  "us-label-space": fill("__password__ "),
  "label-stars": fill("password************ "),
  "underscore-run": fill("_".repeat(63) + " "),
  "label-nbsp-run": fill("password" + "\u00a0".repeat(60) + " "),
  "en-prose": fill("The quick brown fox reviewed the deployment notes before the weekly sync meeting. "),
  "ko-bold-label": fill("**비밀번호** "),
  "us-word-run": fill("_a ".repeat(20)),
  "bold-nbsp8": fill("**password**" + "\u00a0".repeat(8)),
  "bold-nbsp60": fill("**password**" + "\u00a0".repeat(60)),
  "ko-bold-nbsp8": fill("**비밀번호**" + "\u00a0".repeat(8)),
  "bold-wide8": fill("**password**" + "\u3000".repeat(8)),
};
function median(xs) { const s = [...xs].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; }
function time(fn, input) {
  const samples = [];
  for (let i = 0; i < 9; i += 1) {
    const t0 = process.hrtime.bigint();
    if (fn(input)) throw new Error("timing input unexpectedly matched");
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return Math.round(median(samples) * 10) / 10;
}
report.timingMsMedianOf9 = {};
for (const [name, input] of Object.entries(timingInputs)) {
  const row = { bytes: Buffer.byteLength(input), classifyCurrentMs: time((x) => classifyContext(x).mode === "exact", input), current: time(currentPredicate, input) };
  for (const c of candidates) row[c.id] = time(c.test, input);
  report.timingMsMedianOf9[name] = row;
}

const json = JSON.stringify(report, null, 2) + "\n";
if (outFile) writeFileSync(outFile, json);
else process.stdout.write(json);
