import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Module from "node:module";
import { createRequire } from "node:module";
import { arch, platform, release } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [variant, suite, recipeName, sizeText, sampleCountText] = process.argv.slice(2);
const size = Number(sizeText);
const sampleCount = Number(sampleCountText);
const task25 = new Map([
  ["drop", ["", "DROP ", ""]], ["semicolon", ["x", ";", "x"]],
  ["php_opener", ["", "<?a", ""]], ["tag_space", ["<a", " ", ""]],
  ["trace_spaces_equals", ["trace", " ", "="]], ["hyphen", ["", "a-", ""]],
  ["dot", ["", "a.", ""]], ["blanklines", ["a", "\n\n", ""]],
  ["bang_letter", ["", "<!a", ""]], ["html_comment", ["", "<!--", ""]],
  ["npm_dots_x", ["npm", ".", "x"]], ["command_prefix", ["sudo ", "-x ", "x"]],
]);
const e3 = new Map([
  ["boundary-near-misses", ["xpasswd ! ", false]],
  ["repeated-valid-start-misses", ["passwd ! private key ! ", false]],
  ["internal-gap-miss", ["private", "!", false]],
  ["tab-gap-miss", ["private", "!", false]],
  ["trailing-gap-miss", ["passwd", "!", false]],
  ["trailing-js-whitespace-miss", ["passwd", "!", false]],
  ["old-label-gap-miss", ["password", "!", false]],
  ["internal-gap-hit", ["private", "key:", true]],
  ["late-label-hit", ["x", " passwd:", true]],
  ["hyphen-hit", ["x", " secret-key:", true]],
  ["hyphen-miss", ["x", " secret_key:", false]],
  ["no-keyword-text", ["x", false]],
]);
const uri = new Map([
  ["bare-colon", [":", false, true]],
  ["colon-space", [": ", false, true]],
  ["colon-nonspace", [":x", true, true]],
  ["double-slash", ["://", true, true]],
  ["rejected-headings-late-valid", ["Note: ", true, true]],
]);
if (!['baseline', 'current'].includes(variant) || !['task25', 'e3', 'uri'].includes(suite) || !Number.isSafeInteger(size) || size < 1 || size > 10 * 1024 * 1024 || !Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 5) {
  throw new Error("usage: measure-f21-policy-large-child.mjs <baseline|current> <task25|e3|uri> <recipe> <size> <samples>");
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const sourceRelative = "src/core/policy.ts";
const sourceBytes = variant === "baseline"
  ? Buffer.from(execFileSync("git", ["show", "6e308c9:src/core/policy.ts"], { cwd: root, windowsHide: true }))
  : readFileSync(resolve(root, sourceRelative));
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
const exports = variant === "baseline" ? "classifyContext, hasUriScheme, EXACT_PATTERNS" : "classifyContext, hasCredentialLabel, hasUriScheme, EXACT_PATTERNS";
const source = `${sourceBytes.toString("utf8")}\nexport { ${exports} };\n`;
const require = createRequire(import.meta.url);
const ts = require("typescript");
const compiledSource = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = new Module(resolve(root, sourceRelative));
compiled.filename = resolve(root, sourceRelative);
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(compiledSource, resolve(root, sourceRelative));

function exactLength(targetSize, prefix, unit, suffix = "") {
  const remaining = Math.max(0, targetSize - prefix.length - suffix.length);
  return prefix + unit.repeat(Math.ceil(remaining / unit.length)).slice(0, remaining) + suffix;
}
function e3Input(name) {
  if (name === "boundary-near-misses") return "xpasswd ! ".repeat(Math.ceil(size / 10)).slice(0, size);
  if (name === "repeated-valid-start-misses") return "passwd ! private key ! ".repeat(Math.ceil(size / 22)).slice(0, size);
  if (name === "internal-gap-miss") return `private${" ".repeat(Math.max(0, size - 8))}!`;
  if (name === "tab-gap-miss") return `private${"\t".repeat(Math.max(0, size - 8))}!`;
  if (name === "trailing-gap-miss") return `passwd${" ".repeat(Math.max(0, size - 7))}!`;
  if (name === "trailing-js-whitespace-miss") return `passwd${"\v".repeat(Math.max(0, size - 7))}!`;
  if (name === "old-label-gap-miss") return `password${" ".repeat(Math.max(0, size - 9))}!`;
  if (name === "internal-gap-hit") return `private${" ".repeat(Math.max(0, size - 11))}key:`;
  if (name === "late-label-hit") return `${"x".repeat(Math.max(0, size - 8))} passwd:`;
  if (name === "no-keyword-text") return "x".repeat(size);
  const suffix = name === "hyphen-hit" ? " secret-key:" : " secret_key:";
  return `${"x".repeat(Math.max(0, size - suffix.length))}${suffix}`;
}
function uriInput(name) {
  const [suffix, expected] = uri.get(name);
  const valid = "mailto:x";
  const prefix = name === "rejected-headings-late-valid" ? "Note: ".repeat(Math.ceil((size - valid.length) / 6)) : "a".repeat(Math.max(1, size - suffix.length));
  return name === "rejected-headings-late-valid" ? prefix.slice(0, size - valid.length) + valid : (prefix + suffix).slice(0, size);
}
let input; let expected; let target;
if (suite === "task25") {
  const [prefix, unit, suffix] = task25.get(recipeName);
  input = exactLength(size, prefix, unit, suffix);
  target = compiled.exports.classifyContext;
  expected = null;
} else if (suite === "e3") {
  input = e3Input(recipeName);
  expected = e3.get(recipeName)[e3.get(recipeName).length - 1];
  target = compiled.exports.hasCredentialLabel;
} else {
  input = uriInput(recipeName);
  expected = uri.get(recipeName)[1];
  target = compiled.exports.hasUriScheme;
}
if (input.length !== size || (suite === "task25" && (Buffer.byteLength(input, "utf8") !== size || /[^\x00-\x7f]/u.test(input)))) throw new Error("large recipe must produce exact-length input");
const warmupInput = suite === "task25" ? exactLength(Math.min(100, size), ...task25.get(recipeName)) : input.slice(0, Math.min(100, input.length));
const combined = suite === "e3" ? (value) => compiled.exports.EXACT_PATTERNS[0][1](value) : null;
const calls = suite === "e3" ? [["scannerOnly", target], ["combinedTuple0", combined]] : [[suite === "task25" ? "classifyContext" : "hasUriScheme", target]];
for (const [, fn] of calls) fn(warmupInput);
const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = process.hrtime.bigint();
  const actual = target(input);
  const elapsedNs = Number(process.hrtime.bigint() - started);
  if (expected !== null && actual !== expected) throw new Error(`fixed expected mismatch: ${suite}/${recipeName} expected=${expected} actual=${actual}`);
  samples.push({ index, elapsedNs, actual, ...(expected === null ? {} : { expected }) });
}
const combinedSamples = [];
if (combined) {
  for (let index = 0; index < sampleCount; index += 1) {
    const started = process.hrtime.bigint();
    const actual = combined(input);
    const elapsedNs = Number(process.hrtime.bigint() - started);
    if (actual !== expected) throw new Error(`fixed combined expected mismatch: ${suite}/${recipeName} expected=${expected} actual=${actual}`);
    combinedSamples.push({ index, elapsedNs, actual, expected });
  }
}
process.stdout.write(`${JSON.stringify({ type: "result", variant, suite, recipe: recipeName, size, utf16Length: input.length, utf8Bytes: Buffer.byteLength(input), sampleCount, sourceRelative, sourceSha256, environment: { node: process.version, platform: platform(), release: release(), arch: arch() }, expected, samples, combinedSamples })}\n`);
