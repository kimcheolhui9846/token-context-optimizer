import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";

const [sourceRelative, patternIndexText, sizeText, sampleCountText = "5"] = process.argv.slice(2);
const patternIndex = Number(patternIndexText);
const size = Number(sizeText);
const sampleCount = Number(sampleCountText);
if (
  !sourceRelative ||
  !Number.isSafeInteger(patternIndex) ||
  !Number.isSafeInteger(size) || size < 1 ||
  !Number.isSafeInteger(sampleCount) || sampleCount < 1
) {
  throw new Error("usage: policy-lines-perf-child.mjs <source> <pattern-index> <size> [samples]");
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

// Every LF starts another whitespace-consuming attempt; trailing x makes every predicate fail.
const input = "\n ".repeat(Math.ceil((size - 1) / 2)).slice(0, size - 1) + "x";
const predicate = compiled.exports.EXACT_PATTERNS[patternIndex]?.[1];
if (!predicate) throw new Error(`missing predicate at index ${patternIndex}`);
const evaluate = (content) => typeof predicate === "function" ? predicate(content) : predicate.test(content);

evaluate("\n x");
const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = process.hrtime.bigint();
  const result = evaluate(input);
  samples.push({ elapsedNs: Number(process.hrtime.bigint() - started), result });
}

process.stdout.write(JSON.stringify({
  sourceRelative,
  patternIndex,
  utf16Length: input.length,
  utf8Bytes: Buffer.byteLength(input),
  samples,
}));
