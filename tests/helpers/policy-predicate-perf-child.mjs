import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";

const [sourceRelative, patternIndexText, family, sizeText, sampleCountText = "3"] = process.argv.slice(2);
const patternIndex = Number(patternIndexText);
const size = Number(sizeText);
const sampleCount = Number(sampleCountText);
if (
  !sourceRelative ||
  !Number.isSafeInteger(patternIndex) ||
  !family ||
  !Number.isSafeInteger(size) ||
  size < 0 ||
  !Number.isSafeInteger(sampleCount) ||
  sampleCount < 1
) {
  throw new Error("usage: policy-predicate-perf-child.mjs <source> <pattern-index> <family> <size> [samples]");
}

const root = process.cwd();
const sourcePath = resolve(root, sourceRelative);
const source = `${readFileSync(sourcePath, "utf8")}\nexport { EXACT_PATTERNS };\n`;
const require = createRequire(import.meta.url);
const ts = require("typescript");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(sourcePath);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(js, sourcePath);

function exactLength(targetSize, prefix, unit, suffix = "") {
  const remaining = Math.max(0, targetSize - prefix.length - suffix.length);
  return prefix + unit.repeat(Math.ceil(remaining / unit.length)).slice(0, remaining) + suffix;
}

const recipes = {
  delimiter: (targetSize) => exactLength(targetSize, "x", ";", "x"),
  sql: (targetSize) => exactLength(targetSize, "", "DROP "),
  php: (targetSize) => exactLength(targetSize, "", "<?a"),
  comment: (targetSize) => exactLength(targetSize, "", "<!--"),
  uri: (targetSize) => exactLength(targetSize, "", "a-", "!"),
  dotted: (targetSize) => exactLength(targetSize, "", "a-", "!"),
  filename: (targetSize) => exactLength(targetSize, "", "a.", "!"),
  bang: (targetSize) => exactLength(targetSize, "", "<!a"),
  tag: (targetSize) => exactLength(targetSize, "<a", " "),
  identifierId: (targetSize) => exactLength(targetSize, "", "a-", "!"),
  trace: (targetSize) => exactLength(targetSize, "trace", " ", "="),
};
const recipe = recipes[family];
if (!recipe) throw new Error(`unknown family: ${family}`);

const predicate = compiled.exports.EXACT_PATTERNS[patternIndex]?.[1];
if (!predicate) throw new Error(`missing predicate at index ${patternIndex}`);
const input = recipe(size);
const warmupInput = recipe(Math.min(100, size));
const evaluate = (content) => typeof predicate === "function" ? predicate(content) : predicate.test(content);

evaluate(warmupInput);
const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = process.hrtime.bigint();
  const result = evaluate(input);
  samples.push({ elapsedNs: Number(process.hrtime.bigint() - started), result });
}
process.stdout.write(JSON.stringify({
  sourceRelative,
  patternIndex,
  family,
  repetitionCount: size,
  utf16Length: input.length,
  utf8Bytes: Buffer.byteLength(input),
  samples,
}));
