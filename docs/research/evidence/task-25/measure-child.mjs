import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { join, resolve } from "node:path";

const [mode, family, sizeText, sourceRelative = "tests/helpers/policy-baseline.ts"] = process.argv.slice(2);
const size = Number(sizeText);
if (!family || !["predicates", "classifier"].includes(mode) || !Number.isSafeInteger(size) || size < 0 || size > 50_000) {
  throw new Error("usage: measure-child.mjs <predicates|classifier> <family> <utf16-size<=50000> [source-relative-path]");
}

const root = resolve(import.meta.dirname, "../../../..");
const sourcePath = resolve(root, sourceRelative);
const source = readFileSync(sourcePath, "utf8") + `\nexport { EXACT_PATTERNS, hasTechnicalTokenShape, containsTechnicalTokenShape, containsShellCommand, isShellCommandLine, stripShellPunctuation, isPositiveSemanticLine, isPositiveSemanticText };\n`;
const require = createRequire(import.meta.url);
const ts = require("typescript");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(sourcePath);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(js, sourcePath);
const api = compiled.exports;

function exactLength(targetSize, prefix, unit, suffix = "") {
  const remaining = Math.max(0, targetSize - prefix.length - suffix.length);
  return prefix + unit.repeat(Math.ceil(remaining / unit.length)).slice(0, remaining) + suffix;
}
const recipes = {
  drop: (targetSize) => exactLength(targetSize, "", "DROP "),
  semicolon: (targetSize) => exactLength(targetSize, "x", ";", "x"),
  php_opener: (targetSize) => exactLength(targetSize, "", "<?a"),
  tag_space: (targetSize) => exactLength(targetSize, "<a", " "),
  trace_spaces_equals: (targetSize) => exactLength(targetSize, "trace", " ", "="),
  hyphen: (targetSize) => exactLength(targetSize, "", "a-"),
  dot: (targetSize) => exactLength(targetSize, "", "a."),
  blanklines: (targetSize) => exactLength(targetSize, "a", "\n\n"),
  bang_letter: (targetSize) => exactLength(targetSize, "", "<!a"),
  html_comment: (targetSize) => exactLength(targetSize, "", "<!--"),
  npm_dots_x: (targetSize) => exactLength(targetSize, "npm", ".", "x"),
  command_prefix: (targetSize) => exactLength(targetSize, "sudo ", "-x ", "x"),
  secret_missing_separator: (targetSize) => exactLength(targetSize, "token", " ", "x"),
  authorization_missing_value: (targetSize) => exactLength(targetSize, "Authorization", " ", "x"),
  private_key_near_miss: (targetSize) => exactLength(targetSize, "-----BEGIN", " ", "aPRIVATE KEY-----"),
  path_missing_terminator: (targetSize) => exactLength(targetSize, "/a/", "b/", "!"),
  path_segments: (targetSize) => exactLength(targetSize, "a/", "b/", "!"),
  run_command: (targetSize) => exactLength(targetSize, "execute x", " arg", "!"),
  hash_value_near_miss: (targetSize) => exactLength(targetSize, "hash:", "a", "!"),
  underscore_runs: (targetSize) => exactLength(targetSize, "a", "_", "!"),
  hexadecimal_run: (targetSize) => exactLength(targetSize, "", "a"),
  uppercase_dashed_run: (targetSize) => exactLength(targetSize, "AA-", "A", "!"),
  number_suffix_near_miss: (targetSize) => exactLength(targetSize, "1", "2", "x"),
};
const recipe = recipes[family];
const input = recipe?.(size);
if (input === undefined) throw new Error(`unknown family: ${family}`);
const warmupInput = recipe(Math.min(100, size));
const line = input.split(/\r?\n/u)[0] ?? "";

function timed(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  return { elapsedNs: Number(process.hrtime.bigint() - start), result: Boolean(result) };
}

if (mode === "predicates") {
  const probeFns = [
    ...api.EXACT_PATTERNS.map(([, pattern]) => () => typeof pattern === "function" ? pattern(input) : pattern.test(input)),
    () => api.isPositiveSemanticLine(line),
    () => api.isPositiveSemanticText(input),
    () => api.hasTechnicalTokenShape(line),
    () => api.containsTechnicalTokenShape(input),
    () => api.isShellCommandLine(line),
    () => api.containsShellCommand(input),
    () => api.stripShellPunctuation(line),
  ];
  const emitProbe = (type, key, fn, metadata = {}) => {
    fn();
    const samples = Array.from({ length: 5 }, () => timed(fn));
    process.stdout.write(`${JSON.stringify({ type, key, ...metadata, samples })}\n`);
  };
  api.EXACT_PATTERNS.forEach(([reason], index) => emitProbe("pattern", index, probeFns[index], { reason }));
  ["positiveSemanticLine", "positiveSemanticText", "technicalTokenLine", "technicalTokenShape", "shellCommandLine", "shellCommand", "stripShellPunctuation"].forEach((key, index) => emitProbe("helper", key, probeFns[api.EXACT_PATTERNS.length + index]));
  process.stdout.write(`${JSON.stringify({ type: "summary", mode, family, repetitionCount: size, utf16Length: input.length, utf8Bytes: Buffer.byteLength(input) })}\n`);
} else {
  api.classifyContext(warmupInput);
  let classification;
  const samples = Array.from({ length: 5 }, () => {
    const start = process.hrtime.bigint();
    classification = api.classifyContext(input);
    return { elapsedNs: Number(process.hrtime.bigint() - start), result: Boolean(classification) };
  });
  process.stdout.write(JSON.stringify({ mode, family, repetitionCount: size, utf16Length: input.length, utf8Bytes: Buffer.byteLength(input), samples, classification }));
}
