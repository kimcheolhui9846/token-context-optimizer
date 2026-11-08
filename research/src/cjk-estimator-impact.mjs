#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";

const BASE = "f6a9c825376d2daf72c63a3822cc839247cc73f3";
const require = createRequire(import.meta.url);
const SOURCE_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"]);
const RANGE_TEXT = {
  old: [[0x3131, 0xd79d]],
  a: [[0x3040, 0x30ff], [0x3131, 0xd7a3]],
  b: [[0x1100, 0x11ff], [0x3040, 0x30ff], [0x3131, 0xd7a3], [0xff01, 0xff60], [0xff66, 0xff9f], [0xffe0, 0xffe6]],
  c: [[0x1100, 0x11ff], [0x2e80, 0x2eff], [0x2f00, 0x2fdf], [0x2ff0, 0x303f], [0x3040, 0x30ff], [0x3100, 0x31ff], [0x3200, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xd7b0, 0xd7ff], [0xf900, 0xfaff], [0xfe10, 0xfe1f], [0xfe30, 0xfe4f], [0xff01, 0xff60], [0xff66, 0xff9f], [0xffe0, 0xffe6], [0x1aff0, 0x1afff], [0x1b000, 0x1b16f], [0x20000, 0x2a6df], [0x2a700, 0x2b73f], [0x2b740, 0x2b81f], [0x2b820, 0x2ceaf], [0x2ceb0, 0x2ebef], [0x2ebf0, 0x2ee5f], [0x2f800, 0x2fa1f], [0x30000, 0x3134f], [0x31350, 0x323af]],
};
const CANDIDATES = ["aUTF16", "aCP", "bUTF16", "bCP", "cUTF16", "cCP", "oldrangeCP"];
const EXT_TO_SCRIPT_KIND = { ".ts": ts.ScriptKind.TS, ".tsx": ts.ScriptKind.TSX, ".js": ts.ScriptKind.JS, ".jsx": ts.ScriptKind.JSX, ".mjs": ts.ScriptKind.JS, ".cjs": ts.ScriptKind.JS };

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitSha1 = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const scalarLength = (text) => [...text].length;
const inRanges = (cp, ranges) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const cjkCount = (text, ranges) => [...text].filter((ch) => inRanges(ch.codePointAt(0), ranges)).length;
export function estimate(text, ranges, lengthMode) {
  if (text.length === 0) return 0;
  const cjk = cjkCount(text, ranges);
  const length = lengthMode === "cp" ? scalarLength(text) : text.length;
  const nonCjk = Math.max(length - cjk, 0);
  const wordish = text.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(Math.max(wordish, Math.ceil(nonCjk / 4) + cjk)));
}

function candidateSpec(name) {
  if (name === "old") return { range: RANGE_TEXT.old, lengthMode: "utf16" };
  if (name === "oldrangeCP") return { range: RANGE_TEXT.old, lengthMode: "cp" };
  const range = RANGE_TEXT[name[0]];
  return { range, lengthMode: name.endsWith("CP") ? "cp" : "utf16" };
}
function baselineEstimate(text) { return estimate(text, RANGE_TEXT.old, "utf16"); }

function gitEntries(base) {
  const raw = execFileSync("git", ["ls-tree", "-r", "-z", base], { encoding: "buffer", windowsHide: true, maxBuffer: 1024 * 1024 * 128 });
  return raw.toString("utf8").split("\0").filter(Boolean).map((entry) => {
    const match = entry.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/u);
    if (!match) throw new Error(`unexpected ls-tree entry: ${entry}`);
    return { path: match[2], blobSha: match[1] };
  });
}
function gitBlobs(entries) {
  const input = Buffer.from(entries.map(({ blobSha }) => `${blobSha}\n`).join(""), "ascii");
  const output = execFileSync("git", ["cat-file", "--batch"], { input, encoding: "buffer", maxBuffer: 1024 * 1024 * 1024, windowsHide: true });
  const blobs = new Map();
  let cursor = 0;
  for (const entry of entries) {
    const headerEnd = output.indexOf(10, cursor);
    if (headerEnd < 0) throw new Error(`missing cat-file header for ${entry.path}`);
    const header = output.subarray(cursor, headerEnd).toString("ascii").match(/^([0-9a-f]{40}) blob (\d+)\r?$/u);
    if (!header) throw new Error(`unexpected cat-file header for ${entry.path}`);
    const size = Number(header[2]);
    const start = headerEnd + 1;
    const bytes = output.subarray(start, start + size);
    if (header[1] !== entry.blobSha || gitSha1(bytes) !== entry.blobSha) throw new Error(`cat-file blob mismatch for ${entry.path}`);
    blobs.set(entry.path, bytes);
    cursor = start + size;
    if (output[cursor] !== 10) throw new Error(`missing cat-file separator for ${entry.path}`);
    cursor++;
  }
  return blobs;
}
function decode(bytes, path) {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (error) { throw new Error(`invalid UTF-8 ${path}: ${error.message}`); }
}
function lineUnits(text) {
  const units = [];
  let offset = 0;
  for (const line of text.split("\n")) {
    const value = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (value.length > 0) units.push({ kind: "line", offset, text: value });
    offset += line.length + 1;
  }
  return units;
}
function addUnit(units, path, kind, offset, text, detail = undefined, allowEmpty = false) {
  if (typeof text !== "string" || (!allowEmpty && text.length === 0)) return;
  units.push({ path, kind, offset, text, ...(detail ? { detail } : {}) });
}
function parseJsonStrings(text, path, units, issues) {
  const semanticText = text.startsWith("\uFEFF") ? text.slice(1) : text;
  try { JSON.parse(semanticText); } catch (error) { issues.push({ path, kind: "json-parse", message: error.message }); return; }
  for (let i = 0; i < text.length;) {
    if (text[i] !== '"') { i++; continue; }
    const start = i++;
    let escaped = false;
    while (i < text.length) {
      const ch = text[i++];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') break;
    }
    const token = text.slice(start, i);
    if (!token.endsWith('"')) { issues.push({ path, kind: "json-string", message: "unterminated string" }); break; }
    let j = i; while (/\s/u.test(text[j] ?? "")) j++;
    if (text[j] === ":") continue;
    try { addUnit(units, path, "json-string", start, JSON.parse(token), undefined, true); }
    catch (error) { issues.push({ path, kind: "json-string", offset: start, message: error.message }); }
  }
}
function parseJavaScriptStrings(text, path, extension, units, issues) {
  const kind = EXT_TO_SCRIPT_KIND[extension] ?? ts.ScriptKind.JS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = file.parseDiagnostics ?? [];
  if (diagnostics.length) issues.push({ path, kind: "typescript-parse", message: ts.flattenDiagnosticMessageText(diagnostics[0].messageText, " ") });
  function visit(node) {
    if (node.kind === ts.SyntaxKind.StringLiteral || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral || node.kind === ts.SyntaxKind.TemplateHead || node.kind === ts.SyntaxKind.TemplateMiddle || node.kind === ts.SyntaxKind.TemplateTail) {
      if ((node.templateFlags & ts.TokenFlags.ContainsInvalidEscape) !== 0) issues.push({ path, kind: "typescript-invalid-template-escape", offset: node.getStart(file), message: "template chunk contains invalid escape" });
      addUnit(units, path, "ts-string", node.getStart(file), node.text, undefined, true);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
function extractUnits(path, text, issues) {
  const units = [];
  addUnit(units, path, "file", 0, text, undefined, true);
  for (const unit of lineUnits(text)) addUnit(units, path, unit.kind, unit.offset, unit.text);
  const extension = path.slice(path.lastIndexOf("."));
  if (extension === ".json") parseJsonStrings(text, path, units, issues);
  else if (EXT_TO_SCRIPT_KIND[extension]) parseJavaScriptStrings(text, path, extension, units, issues);
  return units;
}
function unitRecord(unit, candidateName, text) {
  const spec = candidateSpec(candidateName);
  const estimateValue = estimate(text, spec.range, spec.lengthMode);
  return { id: `${unit.path}\0${unit.kind}\0${unit.offset}`, path: unit.path, kind: unit.kind, offset: unit.offset, utf16Length: text.length, codePointLength: scalarLength(text), textSha256: sha256(Buffer.from(text)), estimate: estimateValue };
}
function lineColumn(newlines, offset) {
  let lo = 0, hi = newlines.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (newlines[mid] < offset) lo = mid + 1; else hi = mid; }
  const line = lo + 1;
  const lineStart = lo === 0 ? 0 : newlines[lo - 1] + 1;
  return { line, column: offset - lineStart + 1 };
}
function summarizeAnalyses(analyses, candidateName) {
  const changes = analyses.filter((unit) => unit.old !== unit.candidates[candidateName]);
  const deltas = changes.map((unit) => unit.candidates[candidateName] - unit.old);
  const byKind = {};
  const paths = new Set();
  for (const unit of changes) {
    const delta = unit.candidates[candidateName] - unit.old;
    const item = byKind[unit.kind] ??= { changedUnits: 0, changedFiles: 0, positive: 0, negative: 0, minDelta: delta, maxDelta: delta, maxAbsDelta: 0, signedDelta: 0 };
    item.changedUnits++; item.positive += delta > 0 ? 1 : 0; item.negative += delta < 0 ? 1 : 0; item.minDelta = Math.min(item.minDelta, delta); item.maxDelta = Math.max(item.maxDelta, delta); item.maxAbsDelta = Math.max(item.maxAbsDelta, Math.abs(delta)); item.signedDelta += delta; paths.add(unit.path);
  }
  for (const kind of Object.keys(byKind)) byKind[kind].changedFiles = new Set(changes.filter((u) => u.kind === kind).map((u) => u.path)).size;
  return { changedUnits: changes.length, changedFiles: paths.size, positive: deltas.filter((d) => d > 0).length, negative: deltas.filter((d) => d < 0).length, maxAbsDelta: deltas.reduce((m, d) => Math.max(m, Math.abs(d)), 0), signedDelta: deltas.reduce((a, b) => a + b, 0), byKind };
}
const EXPECTED = [
  ["aaaa", { old: 1, aUTF16: 1, aCP: 1, bUTF16: 1, bCP: 1, cUTF16: 1, cCP: 1, oldrangeCP: 1 }],
  ["かなかな", { old: 1, aUTF16: 4, aCP: 4, bUTF16: 4, bCP: 4, cUTF16: 4, cCP: 4, oldrangeCP: 1 }],
  ["\uD79E\uD79F\uD7A0\uD7A1", { old: 1, aUTF16: 4, aCP: 4, bUTF16: 4, bCP: 4, cUTF16: 4, cCP: 4, oldrangeCP: 1 }],
  ["😀😀", { old: 1, aUTF16: 1, aCP: 1, bUTF16: 1, bCP: 1, cUTF16: 1, cCP: 1, oldrangeCP: 1 }],
  ["😀😀😀😀", { old: 2, aUTF16: 2, aCP: 1, bUTF16: 2, bCP: 1, cUTF16: 2, cCP: 1, oldrangeCP: 1 }],
  ["𠀀", { old: 1, aUTF16: 1, aCP: 1, bUTF16: 1, bCP: 1, cUTF16: 2, cCP: 1, oldrangeCP: 1 }],
];
const MATRIX_CASES = (() => {
  const cases = [];
  const add = (id, text) => cases.push({ id, text });
  add("hiragana", String.fromCodePoint(0x3042).repeat(4));
  add("katakana", String.fromCodePoint(0x30a2).repeat(4));
  add("halfwidth-kana", String.fromCodePoint(0xff76).repeat(4));
  add("tail-six", String.fromCodePoint(0xd79e, 0xd79f, 0xd7a0, 0xd7a1, 0xd7a2, 0xd7a3));
  add("jamo", String.fromCodePoint(0x1100).repeat(4));
  add("han", String.fromCodePoint(0x4e00).repeat(4));
  add("extension-b", String.fromCodePoint(0x20000).repeat(4));
  add("compatibility", String.fromCodePoint(0xf900).repeat(4));
  add("fullwidth", String.fromCodePoint(0xff01).repeat(4));
  add("mixed", `${String.fromCodePoint(0x41)}${String.fromCodePoint(0x3131)}${String.fromCodePoint(0x20000)}${String.fromCodePoint(0xff01)}`);
  add("astral", String.fromCodePoint(0x1f600).repeat(4));
  add("lone-high-surrogate", "\ud800");
  add("lone-low-surrogate", "\udc00");
  add("space-u3000", String.fromCodePoint(0x3000).repeat(4));
  add("space-feff", String.fromCodePoint(0xfeff).repeat(4));
  add("vs16", `${String.fromCodePoint(0x2764)}${String.fromCodePoint(0xfe0f)}`);
  add("ivs", `${String.fromCodePoint(0x4e00)}${String.fromCodePoint(0xe0100)}`);
  add("zwj", `${String.fromCodePoint(0x1f469)}${String.fromCodePoint(0x200d)}${String.fromCodePoint(0x1f4bb)}`);
  add("latin-extension-d", String.fromCodePoint(0xa720).repeat(4));
  add("yi", String.fromCodePoint(0xa000).repeat(4));
  for (const cp of [0x3040, 0x30ff, 0x3100, 0x312f, 0x3130, 0x3131, 0xd79d, 0xd79e, 0xd7a3, 0xd7a4, 0x20000, 0x2a6df, 0x2a700, 0x2ebef, 0x2ebf0, 0x2ee5f, 0x2f800, 0x2fa1f, 0x30000, 0x323af, 0xf900, 0xfaff, 0xff01, 0xff60, 0xff66, 0xff9f, 0xffe0, 0xffe6]) add(`boundary-${cp.toString(16)}`, String.fromCodePoint(cp).repeat(4));
  return cases;
})();
function matrixRecords(actual) {
  return MATRIX_CASES.map(({ id, text }) => ({ id, codePoints: [...text].map((ch) => ch.codePointAt(0).toString(16)), text, old: actual(text), mirrorOld: baselineEstimate(text), ...Object.fromEntries(CANDIDATES.map((name) => [name, estimate(text, candidateSpec(name).range, candidateSpec(name).lengthMode)])) }));
}
function actualBaseline() {
  const source = execFileSync("git", ["show", `${BASE}:src/core/token-estimator.ts`], { encoding: "utf8", windowsHide: true });
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, require, console });
  return module.exports.estimateTextTokens;
}
export function selfTest() {
  const actual = actualBaseline();
  for (const [text, expected] of EXPECTED) {
    if (actual(text) !== expected.old) throw new Error(`shipped baseline mismatch for ${JSON.stringify(text)}`);
    for (const [candidate, value] of Object.entries({ old: baselineEstimate(text), ...Object.fromEntries(CANDIDATES.map((name) => [name, estimate(text, candidateSpec(name).range, candidateSpec(name).lengthMode)])) })) if (value !== expected[candidate]) throw new Error(`matrix mismatch ${JSON.stringify({ text, candidate, value, expected: expected[candidate] })}`);
  }
  if (MATRIX_CASES.length < 40) throw new Error("matrix catalog incomplete");
  for (const record of matrixRecords(actual)) if (record.old !== record.mirrorOld) throw new Error(`exact baseline mismatch ${record.id}`);
  const newlineText = "😀\nX\nY";
  const newlineList = []; for (let index = 0; index < newlineText.length; index++) if (newlineText.charCodeAt(index) === 10) newlineList.push(index);
  const x = lineColumn(newlineList, 3); const y = lineColumn(newlineList, 5);
  if (x.line !== 2 || x.column !== 1 || y.line !== 3 || y.column !== 1) throw new Error("UTF-16 newline location invariant failed");
  const templateIssues = []; parseJavaScriptStrings("tag`\\u{`", "synthetic.ts", ".ts", [], templateIssues);
  if (templateIssues.filter((issue) => issue.kind === "typescript-invalid-template-escape").length !== 1) throw new Error("invalid template escape diagnostic invariant failed");
  return { passed: true, cases: EXPECTED.length * 8, matrixCases: MATRIX_CASES.length, invariants: 2, note: "independent literal expectations plus exact-base transpiled baseline" };
}
function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) { console.log(JSON.stringify(selfTest())); return; }
  const outputArg = args.indexOf("--output");
  const output = outputArg >= 0 ? args[outputArg + 1] : "research/results/cjk-estimator-impact.json";
  const root = resolve(process.cwd());
  const entries = gitEntries(BASE).sort((a, b) => compareCodeUnits(a.path, b.path));
  const blobs = gitBlobs(entries);
  const issues = [];
  const files = [];
  const excluded = [];
  const allUnits = [];
  for (const { path, blobSha } of entries) {
    const bytes = blobs.get(path);
    const extension = path.slice(path.lastIndexOf("."));
    if (bytes.includes(0)) {
      if (SOURCE_EXTENSIONS.has(extension)) throw new Error(`NUL in typed text corpus ${path}`);
      excluded.push({ path, blobSha, sha256: sha256(bytes), reason: "binary-NUL" });
      continue;
    }
    let text;
    try { text = decode(bytes, path); }
    catch (error) {
      if (SOURCE_EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) throw error;
      excluded.push({ path, blobSha, sha256: sha256(bytes), reason: "invalid-UTF8" });
      continue;
    }
    const units = extractUnits(path, text, issues);
    files.push({ path, blobSha, sha256: sha256(bytes), utf8Bytes: bytes.length, unitCount: units.length, typed: SOURCE_EXTENSIONS.has(extension) });
    for (const unit of units) allUnits.push(unit);
  }
  if (issues.some((i) => i.kind === "typescript-parse" || i.kind === "json-parse" || i.kind === "json-string")) throw new Error(`corpus parse issues: ${JSON.stringify(issues)}`);
  allUnits.sort((a, b) => compareCodeUnits(a.path, b.path) || compareCodeUnits(a.kind, b.kind) || a.offset - b.offset);
  const sourceTexts = new Map(allUnits.filter((unit) => unit.kind === "file").map((unit) => [unit.path, unit.text]));
  const newlineIndexes = new Map([...sourceTexts].map(([path, text]) => [path, (() => { const out = []; for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) out.push(index); return out; })()]));
  const analyses = allUnits.map((unit) => {
    const baseline = unitRecord(unit, "old", unit.text);
    const outputs = Object.fromEntries(CANDIDATES.map((name) => [name, unitRecord(unit, name, unit.text).estimate]));
    const changed = CANDIDATES.some((name) => baseline.estimate !== outputs[name]);
    const newlineList = newlineIndexes.get(unit.path) ?? [];
    const location = changed ? { start: lineColumn(newlineList, unit.offset), ...(unit.kind === "file" || unit.kind === "line" ? { end: lineColumn(newlineList, unit.offset + unit.text.length) } : {}) } : {};
    return { id: baseline.id, path: baseline.path, kind: baseline.kind, offset: baseline.offset, ...location, textSha256: baseline.textSha256, utf16Length: baseline.utf16Length, codePointLength: baseline.codePointLength, old: baseline.estimate, candidates: outputs };
  });
  const candidates = Object.fromEntries(CANDIDATES.map((name) => [name, summarizeAnalyses(analyses, name)]));
  const changedUnits = analyses.filter((unit) => CANDIDATES.some((name) => unit.old !== unit.candidates[name])).map((unit) => ({ id: unit.id, path: unit.path, kind: unit.kind, offset: unit.offset, start: unit.start, end: unit.end, old: unit.old, candidates: Object.fromEntries(CANDIDATES.filter((name) => unit.old !== unit.candidates[name]).map((name) => [name, { new: unit.candidates[name], delta: unit.candidates[name] - unit.old }])), textSha256: unit.textSha256, utf16Length: unit.utf16Length, codePointLength: unit.codePointLength }));
  const budgets = Object.fromEntries(CANDIDATES.map((name) => [name, Object.fromEntries([80, 120, 240].map((budget) => [budget, { oldEstimate: analyses.filter((u) => u.old <= budget).length, newEstimate: analyses.filter((u) => u.candidates[name] <= budget).length, changed: analyses.filter((u) => (u.old <= budget) !== (u.candidates[name] <= budget)).length }]))]));
  const unitsByKind = Object.fromEntries([...new Set(allUnits.map((unit) => unit.kind))].sort(compareCodeUnits).map((kind) => [kind, allUnits.filter((unit) => unit.kind === kind).length]));
  const actual = actualBaseline();
  const result = { schemaVersion: 1, methodology: { purpose: "deterministic impact investigation; not a product behavior change", base: BASE, sourceRoot: ".", typedSemanticCorpus: "md raw/lines; TypeScript/JavaScript literal chunks; JSON string values excluding keys", rawCorpus: "all tracked UTF-8 text blobs; binary and unknown invalid-UTF8 blobs are explicitly excluded", unitOrder: "path, unit kind, UTF-16 offset", estimator: "old plus six range/length candidates and old-range code-point control", noRawRepositoryValues: true }, base: BASE, node: process.version, typescript: ts.version, corpus: { extensions: [...SOURCE_EXTENSIONS].sort(), files, excluded, units: allUnits.length, unitsByKind, issues }, ranges: RANGE_TEXT, candidates, changedUnits, budgets, matrix: { cases: matrixRecords(actual), expected: EXPECTED.map(([text, values]) => ({ text, values })), selfTest: selfTest() }, limitations: ["Dynamic runtime strings are not evaluated.", "Template expressions and regex literals are excluded; only literal template chunks are extracted.", "JSX text is not treated as a string literal.", "Parse failures are fatal for the relevant corpus file."] };
  mkdirSync(dirname(resolve(root, output)), { recursive: true });
  writeFileSync(resolve(root, output), `${JSON.stringify(result, null, 2)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
