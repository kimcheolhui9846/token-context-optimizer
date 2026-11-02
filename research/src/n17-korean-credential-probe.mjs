// N-17 pre-design probe: Korean credential labels in classifyContext.
//
// Loads the BUILT product classifier (run `npm run build` in the checkout
// first) and reports, for a candidate Korean label predicate:
//   1. current mode for label x separator, alone and inside a sentence
//   2. current mode of hand-written exposure / over-protection sentences
//   3. impact on tracked Korean Markdown in this repository (lines and
//      paragraphs): which units the candidate would turn into exact
//   4. candidate regex time on ~10 MiB near-miss inputs (informational only;
//      the implementation needs its own performance gate)
//
// Usage: node research/src/n17-korean-credential-probe.mjs <checkout-with-dist> [--out <file>]
// The candidate predicate is defined here only; it is not product code.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? ".");
const { classifyContext } = await import(pathToFileURL(resolve(checkout, "dist/src/core/policy.js")).href);
const policySource = readFileSync(resolve(checkout, "src/core/policy.ts"), "utf8").replace(/\r\n/g, "\n");

const SEP = "[ \\t]*[:=\\uFF1A]";
const SP = "[ \\t]?";
export const T1 = [
  `비밀${SP}번호`, "비번", `패스${SP}워드`, `인증${SP}키`, `개인${SP}키`, `비밀${SP}키`, `시크릿${SP}키`,
  `액세스${SP}키`, `(?<![A-Za-z0-9])api${SP}키`, `복구${SP}코드`, `백업${SP}코드`,
  `인증${SP}토큰`, `접근${SP}토큰`, `액세스${SP}토큰`,
];
export const T2 = ["암호", "토큰", `보안${SP}코드`];
const re1 = new RegExp(`(?:${T1.join("|")})${SEP}`, "i");
const re2 = new RegExp(`(?:${T2.join("|")})${SEP}`, "i");
const reAll = new RegExp(`(?:${[...T1, ...T2].join("|")})${SEP}`, "i");

const report = {
  schema: "n17-korean-credential-probe/v1",
  policySha256Lf: (await import("node:crypto")).createHash("sha256").update(policySource).digest("hex"),
  candidate: { separator: SEP, t1: T1, t2: T2, flags: "i", leftBoundary: "none for Hangul labels; ASCII lookbehind for api" },
};

// 1. label x separator matrix
const prose = "오늘 회의에서 다음 분기 계획을 정리했고 팀원들에게 공유하기로 했다.";
const labels = ["비밀번호", "비번", "암호", "패스워드", "인증키", "API 키", "개인키", "토큰", "인증 토큰", "복구 코드", "계정 비밀번호", "password"];
report.matrix = [];
for (const label of labels) {
  for (const sep of [": ", "=", "："]) {
    const line = `${label}${sep}hunter2`;
    const sentence = `회의실 ${label}${sep}hunter2 이니까 접속할 때 참고해 주세요.`;
    report.matrix.push({
      line, alone: classifyContext(line).mode, withKoreanProseLine: classifyContext(`${prose}\n${line}`).mode,
      inSentence: classifyContext(sentence).mode, candidateMatches: reAll.test(line),
    });
  }
}

// 2. hand-written sentences
const sentences = {
  exposure: [
    "회의실 와이파이 비밀번호: hunter2 이니까 접속할 때 참고해 주세요.",
    "새로 받은 암호: hunter2 를 내일까지 바꿔야 한다고 들었어요.",
    "관리자 계정 비번: hunter2 으로 로그인해서 설정을 바꿔 주세요.",
    "배포용 인증 토큰: hunter2 를 환경 변수에 넣어 두었습니다.",
    "고객센터에서 받은 OTP: 482913 을 입력하면 된다고 합니다.",
  ],
  outOfScope: [
    "서버 접속 비밀번호는 hunter2 이니 외부에 공유하지 마세요.",
    "The guest wifi password is hunter2 so please share it carefully.",
    "Guest wifi password：hunter2 is taped under the desk for visitors.",
  ],
  overProtection: [
    "암호: 이 장에서는 고대부터 현대까지 암호의 역사를 간단히 살펴본다.",
    "토큰: 언어 모델이 한 번에 처리하는 텍스트의 기본 단위를 말한다.",
    "비밀번호: 영문과 숫자를 섞어 여덟 자 이상으로 설정해야 합니다.",
  ],
  mustNotMatch: [
    "암호화: 평문을 정해진 규칙으로 바꾸는 과정을 이 절에서 설명한다.",
    "토큰화: 문장을 모델이 처리할 단위로 나누는 과정을 말한다.",
    "비밀번호 변경: 설정 화면에서 언제든지 바꿀 수 있습니다.",
  ],
};
report.sentences = Object.fromEntries(Object.entries(sentences).map(([k, list]) => [k, list.map((s) => {
  const r = classifyContext(s);
  return { text: s, mode: r.mode, reasons: r.reasons, t1: re1.test(s), t2: re2.test(s) };
})]));

// 3. repository Korean Markdown
const files = execFileSync("git", ["ls-files", "*.md"], { cwd: checkout, encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean)
  .filter((f) => /[가-힣]/u.test(readFileSync(resolve(checkout, f), "utf8")));
const units = new Map();
for (const f of files) {
  const text = readFileSync(resolve(checkout, f), "utf8").replace(/\r\n/g, "\n");
  for (const line of text.split("\n")) if (line.trim()) units.set(`L\0${line}`, { f, kind: "line", text: line });
  for (const para of text.split(/\n\s*\n/)) if (para.trim()) units.set(`P\0${para}`, { f, kind: "paragraph", text: para });
}
const corpus = { files: files.length, uniqueUnits: units.size, counts: {}, changed: [] };
for (const { f, kind, text } of units.values()) {
  const m1 = re1.test(text), m2 = re2.test(text);
  if (!m1 && !m2) continue;
  const mode = classifyContext(text).mode;
  const key = `${kind}:${m1 ? "t1" : "t2"}:${mode}`;
  corpus.counts[key] = (corpus.counts[key] ?? 0) + 1;
  if (mode !== "exact") corpus.changed.push({ file: f, kind, tier: m1 ? "t1" : "t2", from: mode, text: text.slice(0, 160) });
}
report.corpus = corpus;

// 4. candidate regex time on near-miss inputs (~10 MiB UTF-8 or less)
const MiB = 1024 * 1024;
const fill = (unit) => unit.repeat(Math.ceil((10 * MiB) / Buffer.byteLength(unit))).slice(0, Math.floor((10 * MiB) / 3));
const perfInputs = {
  nearMissSpacedLabel: fill("비밀 번호 "),
  nearMissTabs: fill("비밀\t\t\t\t\t\t"),
  koreanProse: fill(`${prose} `),
};
report.performance = { note: "informational; 5 runs, median; not a gate", rows: {} };
for (const [name, s] of Object.entries(perfInputs)) {
  const times = [];
  for (let i = 0; i < 5; i += 1) { const t = performance.now(); reAll.test(s); times.push(performance.now() - t); }
  const t0 = performance.now(); classifyContext(s); const classifyMs = performance.now() - t0;
  times.sort((a, b) => a - b);
  report.performance.rows[name] = { utf8Bytes: Buffer.byteLength(s), candidateRegexMedianMs: Math.round(times[2] * 10) / 10, classifyContextMs: Math.round(classifyMs) };
}
report.environment = { node: process.version, platform: process.platform };

const out = process.argv.indexOf("--out");
const text = `${JSON.stringify(report, null, 2)}\n`;
if (out > 0) writeFileSync(resolve(process.cwd(), process.argv[out + 1]), text);
else process.stdout.write(text);
