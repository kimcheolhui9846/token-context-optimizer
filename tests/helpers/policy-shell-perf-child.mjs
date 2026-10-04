import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import Module from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

const [sourceRelative, family, sizeText, sampleCountText = "5"] = process.argv.slice(2);
const size = Number(sizeText);
const sampleCount = Number(sampleCountText);
if (!sourceRelative || !["punctuation", "commandArgument"].includes(family) ||
  !Number.isSafeInteger(size) || size < 4 || !Number.isSafeInteger(sampleCount) || sampleCount < 1) {
  throw new Error("usage: policy-shell-perf-child.mjs <source> <punctuation|commandArgument> <size> [samples]");
}

const root = process.cwd();
const sourcePath = resolve(root, sourceRelative);
const source = readFileSync(sourcePath, "utf8");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const hasCommandArgumentShape = file.statements.some(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "hasCommandArgumentShape",
);
const exports = ["stripShellPunctuation"];
if (hasCommandArgumentShape) exports.push("hasCommandArgumentShape");
const instrumented = `${source}\nexport { ${exports.join(", ")} };\n`;
const js = ts.transpileModule(instrumented, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiled = new Module(sourcePath);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(js, sourcePath);

function legacyCommandArgumentPredicate() {
  const helper = file.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "hasTechnicalTokenShape",
  );
  let candidate;
  const visit = (node) => {
    if (ts.isArrayLiteralExpression(node)) candidate = node.elements[2];
    ts.forEachChild(node, visit);
  };
  if (helper?.body) visit(helper.body);
  if (!candidate || !ts.isRegularExpressionLiteral(candidate)) {
    throw new Error("command-argument helper is missing and third legacy predicate is not a RegExp literal");
  }
  return runInNewContext(candidate.getText(file));
}

const predicate = family === "punctuation"
  ? compiled.exports.stripShellPunctuation
  : (compiled.exports.hasCommandArgumentShape ?? legacyCommandArgumentPredicate());
if (typeof predicate !== "function" && typeof predicate?.test !== "function") throw new Error(`missing ${family} predicate`);

const input = family === "punctuation"
  ? `npm${".".repeat(size - 4)}x`
  : "a-".repeat(Math.ceil((size - 1) / 2)).slice(0, size - 1) + "x";
const evaluate = family === "punctuation"
  ? predicate
  : (value) => typeof predicate === "function" ? predicate(value) : predicate.test(value);
evaluate(family === "punctuation" ? "npm)x" : "a-x");
const samples = [];
for (let index = 0; index < sampleCount; index += 1) {
  const started = process.hrtime.bigint();
  const result = evaluate(input);
  const elapsedNs = Number(process.hrtime.bigint() - started);
  samples.push({
    elapsedNs,
    result: typeof result === "string"
      ? { length: result.length, prefix: result.slice(0, 3), suffix: result.slice(-1) }
      : result,
  });
}
process.stdout.write(JSON.stringify({
  sourceRelative,
  family,
  utf16Length: input.length,
  utf8Bytes: Buffer.byteLength(input),
  samples,
}));
